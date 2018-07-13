(function(Vue, Canvas, WorkerUtil, WebGl, WorkerHeaders, Constants, VueMixins, EditorThemes, UserSettings, AlgorithmModel, WebGlSmoothing, WebGlBilateralFilter, WebGlCanvasFilters, ImageFiltersModel, WebGlImageOutline, ColorPicker, WebGlImageEdge){
    //webworker stuff
    let imageId = 0;
    let ditherWorkers;
    
    //canvases
    let sourceCanvas;
    let originalImageCanvas;
    let transformCanvas;
    let ditherOutputCanvas;
    let transformCanvasWebGl;
    let sourceCanvasOutput;
    let transformCanvasOutput;
    let outlineFilterCanvas;
    
    let sourceWebglTexture;
    let ditherOutputWebglTexture;

    //used to keep track of which tabs have loaded a new image to them, after an image is loaded
    //this is because originally, only the active tab when an image is loaded will register it as new
    const tabsThatHaveSeenImageSet = new Set();

    Vue.component('dither-studio', {
        template: document.getElementById('dither-studio-component'),
        created: function(){
            WorkerUtil.getDitherWorkers(Constants.ditherWorkerUrl).then((workers)=>{
                ditherWorkers = workers;
                ditherWorkers.forEach((ditherWorker)=>{
                    ditherWorker.onmessage = this.workerMessageReceivedDispatcher; 
                 });
            });
            originalImageCanvas = Canvas.create();
            sourceCanvas = Canvas.create();
            transformCanvas = Canvas.create();
            transformCanvasWebGl = Canvas.createWebgl();
            ditherOutputCanvas = Canvas.create();
            this.areCanvasFiltersSupported = Canvas.areCanvasFiltersSupported(originalImageCanvas);
            //check for webgl support
            if(transformCanvasWebGl.gl){
                this.isWebglSupported = true;
                this.isWebglHighpFloatSupported = transformCanvasWebGl.supportsHighFloatPrecision;
            }

            //remove webgl algorithms requiring high precision ints (if necessary)
            if(!transformCanvasWebGl.supportsHighIntPrecision){
                const removeUnsupportedWebGl = (algorithm)=>{
                    if(algorithm.requiresHighPrecisionInt){
                        algorithm.webGlFunc = null;
                    }
                    return algorithm;
                };
                this.bwDitherAlgorithms = this.bwDitherAlgorithms.map(removeUnsupportedWebGl);
                this.colorDitherAlgorithms = this.colorDitherAlgorithms.map(removeUnsupportedWebGl);
            }

            //image outlines are webgl only, so no need to do this if webgl is not supported
            if(this.isWebglSupported){
                outlineFilterCanvas = Canvas.create();
                //remove unsupported canvas blend modes
                this.imageOutlineFixedColorBlendModes = this.imageOutlineFixedColorBlendModes.filter((blendMode)=>{
                    return Canvas.isBlendModeSupported(outlineFilterCanvas, blendMode.value);
                });
                //reset to default blend mode
                Canvas.resetBlendMode(outlineFilterCanvas);
            }
        },
        mounted: function(){
            const refs = this.$refs;
            sourceCanvasOutput = Canvas.create(refs.sourceCanvasOutput);
            transformCanvasOutput = Canvas.create(refs.transformCanvasOutput);
            
            //load global settings
            const globalSettings = UserSettings.getGlobalSettings(this.areControlsPinned());
            this.currentEditorThemeIndex = EditorThemes.indexForKey(this.editorThemes, globalSettings.editorThemeKey);
            this.showOriginalImage = globalSettings.showOriginalImage;
            this.isLivePreviewEnabled = globalSettings.isLivePreviewEnabled;
            this.isColorPickerLivePreviewEnabledSetting = globalSettings.isColorPickerLivePreviewEnabled;
            this.automaticallyResizeLargeImages = globalSettings.automaticallyResizeLargeImages;
            this.isWebglEnabled = this.isWebglSupported && globalSettings.isWebglEnabled;

            //should be last statement of mounted function
            this.finishedInitialization = true;
        },
        data: function(){
            return {
                bwDitherAlgorithms: AlgorithmModel.bwDitherAlgorithms,
                colorDitherAlgorithms: AlgorithmModel.colorDitherAlgorithms,
                bwDitherComponentId: 0,
                colorDitherComponentId: 1,
                activeDitherComponentId: 1,
                activeControlsTab: 0,
                //loadedImage has properties: width, height, fileName, fileType, and optionally unsplash info
                loadedImage: null,
                isLivePreviewEnabled: true,
                isColorPickerLivePreviewEnabledSetting: false,
                automaticallyResizeLargeImages: true,
                isWebglSupported: false,
                isWebglEnabled: false,
                isWebglHighpFloatSupported: false,
                /**
                 * Filters
                 */
                //pixelation
                selectedPixelateImageZoom: 0,
                //smoothing
                imageSmoothingValues: ImageFiltersModel.smoothingValues,
                selectedImageSmoothingRadiusBefore: 0,
                selectedImageSmoothingRadiusAfter: 0,
                //bilateral filter
                bilateralFilterValues: ImageFiltersModel.bilateralFilterValues,
                selectedBilateralFilterValue: 0,
                selectedBilateralFilterValueAfter: 0,
                //image outline filter
                selectedImageOutlineRadiusPercent: 25, //value of 6.5 is a decent default for both pixelated and not
                imageOutlineRadiusPercentages: ImageFiltersModel.outlineRadiusPercentages(),
                imageOutlineColorModes: ImageFiltersModel.outlineColorModes(),
                selectedOutlineColorMode: 0,
                imageOutlineTypes: ImageFiltersModel.outlineFilterTypes(),
                selectedImageOutlineType: 0,
                imageOutlineEdgeStrengths: ImageFiltersModel.outlineEdgeStrengths(),
                selectedImageOutlineStrength: 2,
                imageOutlineEdgeThicknesses: ImageFiltersModel.outlineEdgeThicknesses(),
                selectedImageOutlineEdgeThickness: 1, //value of 2 is decent default
                fixedOutlineColor: '#000000',
                imageOutlineFixedColorBlendModes: ImageFiltersModel.canvasBlendModes(),
                selectedOutlineFixedColorBlendMode: 0,
                shouldShowColorPicker: false,
                //selectedImageSaturationIndex and selectedImageContrastIndex use this array
                canvasFilterValues: ImageFiltersModel.canvasFilterValues,
                selectedImageSaturationIndex: ImageFiltersModel.canvasFilterValuesDefaultIndex,
                selectedImageContrastIndex: ImageFiltersModel.canvasFilterValuesDefaultIndex,
                selectedImageBrightnessIndex: ImageFiltersModel.canvasFilterValuesDefaultIndex,
                hueRotationValue: 0,
                areCanvasFiltersSupported: false, //required for increasing image contrast and saturation
                showOriginalImage: true,
                editorThemes: EditorThemes.get(),
                currentEditorThemeIndex: null,
                openImageErrorMessage: null,
                showWebglWarningMessage: false,
                //used so we know when component is done initializing,
                //so we don't do any spurious saving of global setting changes
                //done by initialization rather than user
                finishedInitialization: false,
            };
        },
        computed: {
            //the source canvas for transformed (dithered and filtered image)
            //before zoom
            transformedSourceCanvas: function(){
                if(this.isImageOutlineFilterActive){
                    return outlineFilterCanvas;
                }
                return transformCanvas;
            },
            /**
             * Image outline filter stuff
             */
            isImageOutlineFilterEnabled: function(){
                //only enabled for color dither
                return this.isImageLoaded && this.isWebglEnabled && this.activeDitherComponentId === 1;
            },
            isImageOutlineFilterActive: function(){
                return this.isImageOutlineFilterEnabled && this.selectedImageOutlineTypeId !== 0;
            },
            isImageEdgeFilterActive: function(){
                return this.isImageOutlineFilterActive && this.selectedImageOutlineTypeId === 1;
            },
            isImageContourFilterActive: function(){
                return this.isImageOutlineFilterActive && this.selectedImageOutlineTypeId === 2;
            },
            selectedImageOutlineTypeId: function(){
                return this.imageOutlineTypes[this.selectedImageOutlineType].id;
            },
            isImageOutlineFixedColor: function(){
                return this.imageOutlineColorModes[this.selectedOutlineColorMode].id === 1;
            },
            areOutlineBlendModesSupported: function(){
                return this.imageOutlineFixedColorBlendModes.length > 1;
            },
            isColorPickerLivePreviewEnabled: function(){
                return this.isLivePreviewEnabled && this.isColorPickerLivePreviewEnabledSetting;
            },
            isImageLoaded: function(){
              return this.loadedImage != null;  
            },
            imageHeader: function(){
                if(!this.isImageLoaded){
                    return null;
                }
                let width = Math.ceil(this.loadedImage.width * (this.pixelateImageZoom / 100));
                let height = Math.ceil(this.loadedImage.height * (this.pixelateImageZoom / 100));
                return {
                    width: width,
                    height: height,
                    //filter values are used for color dither for optimize palette results caching
                    //doesn't need the value of image smoothing after, since this happens after the dither completes
                    pixelation: this.selectedPixelateImageZoom,
                    contrast: this.selectedImageContrastIndex,
                    saturation: this.selectedImageSaturationIndex,
                    smoothing: this.selectedImageSmoothingRadiusBefore,
                };
            },
            activeDitherSection: function(){
                if(this.activeDitherComponentId === this.bwDitherComponentId){
                    return this.$refs.bwDitherSection;
                }
                return this.$refs.colorDitherSection;
            },
            globalControlsTabs: function(){
                let tabs = [
                    {name: 'Open'},
                    {name: 'Image'},
                    {name: 'Settings'},
                    {name: 'Export'},
                ];
                if(!this.isImageLoaded){
                    tabs[1].isDisabled = true;
                    tabs[3].isDisabled = true;
                }

                return tabs;
            },
            pixelateImageZooms: function(){
                const dimensions = this.isImageLoaded ? this.loadedImage.height * this.loadedImage.width : 0;
                return ImageFiltersModel.pixelationValues(dimensions);
            },
            pixelateImageZoom: function(){
                return this.pixelateImageZooms[this.selectedPixelateImageZoom];
            },
            isImagePixelated: function(){
                return this.pixelateImageZoom !== 100;
            },
            webglWarningMessage: function(){
                //based on: https://stackoverflow.com/questions/2901102/how-to-print-a-number-with-commas-as-thousands-separators-in-javascript
                //for integers only
                function formatInteger(d){
                    return d.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
                }
                //I have no idea what units MAX_TEXTURE_SIZE is in, and no resource seems to explain this,
                //but multiplying it by 2048 seems to get the maximum image dimensions webgl will dither 
                const maxTextureDimensions = transformCanvasWebGl.maxTextureSize * 2048;
                if(this.isImageLoaded && this.isWebglEnabled && this.loadedImage.height*this.loadedImage.width > maxTextureDimensions){
                    return `It appears that the image you just opened has larger total dimensions than your max WebGL texture size of ${formatInteger(maxTextureDimensions)} pixels. It is recommended you either: disable WebGL in settings (this will decrease performance), pixelate the image, or crop or resize the image in the image editor of you choice and then reopen it.`;
                }
                return '';
            },
            imageFiltersRaw: function(){
                const filters = {};
                const contrast = this.canvasFilterValues[this.selectedImageContrastIndex];
                const saturation = this.canvasFilterValues[this.selectedImageSaturationIndex];
                const brightness = this.canvasFilterValues[this.selectedImageBrightnessIndex];
                const hue = Math.floor(this.hueRotationValue);
                //100% is unchanged
                if(contrast !== 100){
                    filters['contrast'] = contrast;
                }
                if(saturation !== 100){
                    filters['saturation'] = saturation;
                }
                if(brightness !== 100){
                    filters['brightness'] = brightness;
                }
                if(hue > 0 && hue < 360){
                    filters['hue'] = hue;
                }
                return filters;
            },
            imageFilters: function(){
                const filtersRaw = this.imageFiltersRaw;
                const filters = [];
                if('contrast' in filtersRaw){
                    filters.push(`contrast(${filtersRaw.contrast}%)`);
                }
                if('saturation' in filtersRaw){
                    filters.push(`saturate(${filtersRaw.saturation}%)`);
                }
                if('brightness' in filtersRaw){
                    filters.push(`brightness(${filtersRaw.brightness}%)`);
                }
                if('hue' in filtersRaw){
                    filters.push(`hue-rotate(${filtersRaw.hue}deg)`);
                }
                return filters.join(' ');
            },
            isSmoothingEnabled: function(){
                return this.isWebglEnabled && this.isWebglHighpFloatSupported;
            },
            areCanvasFiltersEnabled: function(){
                return this.areCanvasFiltersSupported || this.isWebglEnabled; 
            },
            serializedGlobalSettings: function(){
                const editorThemeKey = this.currentEditorThemeIndex === null ? '' : this.editorThemes[this.currentEditorThemeIndex].key;

                return {
                    editorThemeKey: editorThemeKey,
                    isWebglEnabled: this.isWebglEnabled,
                    isLivePreviewEnabled: this.isLivePreviewEnabled,
                    isColorPickerLivePreviewEnabled: this.isColorPickerLivePreviewEnabledSetting,
                    automaticallyResizeLargeImages: this.automaticallyResizeLargeImages,
                    showOriginalImage: this.showOriginalImage,
                };
            },
        },
        watch: {
            loadedImage: function(newValue, oldValue){
                //only do this for the first image loaded
                if(!oldValue){
                    //make links open in new tab now, so user won't lose saved work
                    document.querySelectorAll('.nav a').forEach((link)=>{
                        link.target = '_blank';
                    });
                }
            },
            currentEditorThemeIndex: function(newThemeIndex, oldThemeIndex){
                const classList = document.documentElement.classList;
                //need this for firefox full screen mode to work
                const classList2 = document.body.classList;
                //this will be null on original page load
                if(oldThemeIndex !== null){
                    const oldThemeClass = this.editorThemes[oldThemeIndex].className;
                    classList.remove(oldThemeClass);
                    classList2.remove(oldThemeClass);
                }
                const newThemeClass = this.editorThemes[newThemeIndex].className;
                classList.add(newThemeClass);
                classList2.add(newThemeClass);
            },
            serializedGlobalSettings: function(newValue){
                if(this.finishedInitialization){
                    UserSettings.saveGlobalSettings(newValue);
                }
            },
            pixelateImageZoom: function(newValue, oldValue){
                if(newValue !== oldValue){
                    this.imageFiltersBeforeDitherChanged();
                }
            },
            imageFilters: function(){
                if(this.isImageLoaded){
                    this.imageFiltersBeforeDitherChanged();
                }
            },
            selectedBilateralFilterValue: function(newValue, oldValue){
                if(this.isImageLoaded && newValue !== oldValue){
                    this.imageFiltersBeforeDitherChanged();
                }
            },
            selectedBilateralFilterValueAfter:function(newValue, oldValue){
                if(this.isImageLoaded && newValue !== oldValue){
                    this.imageFiltersAfterDitherChanged();
                }
            },
            selectedImageSmoothingRadiusBefore: function(newValue, oldValue){
                if(this.isImageLoaded && newValue !== oldValue){
                    this.imageFiltersBeforeDitherChanged();
                }
            },
            selectedImageSmoothingRadiusAfter: function(newValue, oldValue){
                if(this.isImageLoaded && newValue !== oldValue){
                    this.imageFiltersAfterDitherChanged();
                }
            },
            /**
             * Image outline filter stuff
             */
            //clear outline canvas when not active to free up memory
            isImageOutlineFilterActive: function(newValue, oldValue){
                if(!newValue && newValue !== oldValue && outlineFilterCanvas){
                    Canvas.clear(outlineFilterCanvas);
                }
            },
            selectedImageOutlineRadiusPercent: function(newValue, oldValue){
                if(newValue !== oldValue){
                    this.imageOutlineFilterAction();
                    this.zoomImage();
                }
            },
            selectedOutlineColorMode: function(newValue, oldValue){
                if(newValue !== oldValue){
                    this.imageOutlineFilterAction();
                    this.zoomImage();
                }
            },
            fixedOutlineColor: function(newValue, oldValue){
                if(newValue !== oldValue){
                    this.imageOutlineFilterAction();
                    this.zoomImage();
                }
            },
            selectedOutlineFixedColorBlendMode: function(newValue, oldValue){
                if(newValue !== oldValue){
                    this.imageOutlineFilterAction();
                    this.zoomImage();
                }
            },
            selectedImageOutlineType: function(newValue, oldValue){
                if(newValue !== oldValue){
                    this.imageOutlineFilterAction();
                    this.zoomImage();
                }
            },
            selectedImageOutlineStrength: function(newValue, oldValue){
                if(newValue !== oldValue){
                    this.imageOutlineFilterAction();
                    this.zoomImage();
                }
            },
            selectedImageOutlineEdgeThickness: function(newValue, oldValue){
                if(newValue !== oldValue){
                    this.imageOutlineFilterAction();
                    this.zoomImage();
                }
            },
        },
        methods: {
            /*
            * Tabs
            */
            setActiveControlsTab: function(tabIndex, isDisabled){
                if(isDisabled){
                    return;
                }
                this.activeControlsTab = tabIndex;
            },
            loadDitherTab: function(componentId){
                if(componentId === this.activeDitherComponentId){
                    return;
                }
                this.activeDitherComponentId = componentId;
                if(this.isImageLoaded){
                    const hasSeenImage = tabsThatHaveSeenImageSet.has(this.activeDitherComponentId);
                    tabsThatHaveSeenImageSet.add(this.activeDitherComponentId);
                    this.activeDitherSection.imageLoaded(this.imageHeader, !hasSeenImage);   
                }
            },
            /*
            * Loading and saving image stuff
            */
            onSaveRequested: function(exportCanvas, shouldUpsample, callback){
                //scale canvas if pixelated
                const scale = this.isImagePixelated && shouldUpsample ? 100 / this.pixelateImageZoom : 1;
                //while technicaly we can just use transformedSourceCanvas directly if there is no pixelation
                //it makes the logic for clearing the canvas in export component easier
                //since we don't need to check if we are using transform canvas directly
                Canvas.copy(this.transformedSourceCanvas, exportCanvas, scale);

                callback(exportCanvas, this.loadedImage.unsplash);
            },
            loadImage: function(image, file){
                this.openImageErrorMessage = null;
                const loadedImage = {
                    width: image.width,
                    height: image.height,
                    fileName: file.name,
                    fileSize: file.size,
                    fileType: file.type,
                    unsplash: file.unsplash || null,
                };
                //show webgl warning if any, until user closes it
                this.showWebglWarningMessage = true;
                this.$refs.exportTab.fileChanged(file.name);
                
                //resize large images if necessary
                const largeImageDimensionThreshold = 1200;
                const largestImageDimension = Math.max(loadedImage.width, loadedImage.height);
                if(this.automaticallyResizeLargeImages && largestImageDimension > largeImageDimensionThreshold){
                    const resizePercentage = largeImageDimensionThreshold / largestImageDimension;
                    Canvas.loadImage(originalImageCanvas, image, resizePercentage);
                    loadedImage.width = originalImageCanvas.canvas.width;
                    loadedImage.height = originalImageCanvas.canvas.height;
                }
                else{
                    Canvas.loadImage(originalImageCanvas, image);
                }
                originalImageCanvas.context.drawImage(originalImageCanvas.canvas, 0, 0);
                //finish loading image
                this.loadedImage = loadedImage;
                const zoomBar = this.$refs.zoomBar;
                //can't use reactive property, since it will be updated after this method finishes, so have to set manually
                zoomBar.image = loadedImage;
                zoomBar.zoomFit();
                this.imageFiltersBeforeDitherChanged(false);
                tabsThatHaveSeenImageSet.clear();
                tabsThatHaveSeenImageSet.add(this.activeDitherComponentId);
                this.activeDitherSection.imageLoaded(this.imageHeader, true);
                //this is so mobile users will actually be able to see that an image has loaded
                //have to use a timer since unsplashAttributionContainer won't be in proper place on initial page load
                if(!this.areControlsPinned()){
                    setTimeout(()=>{
                        this.$refs.unsplashAttributionContainer.scrollIntoView({behavior: 'smooth', block: 'start'});
                    }, 1);
                }
            },
            imageFiltersBeforeDitherChanged: function(notifyDitherSection=true){
                //apply filters
                this.imagePixelationChanged();
                if(this.isWebglEnabled){
                    //reset source texture
                    transformCanvasWebGl.gl.deleteTexture(sourceWebglTexture);
                    sourceWebglTexture = WebGl.createAndLoadTextureFromCanvas(transformCanvasWebGl.gl, sourceCanvas.canvas);
                    if(!this.areCanvasFiltersSupported){
                        this.applyWebGlCanvasFilters();
                    }
                    let hasImageBeenTransformed = false;
                    hasImageBeenTransformed = this.bilateralFilterValueChanged() || hasImageBeenTransformed;
                    hasImageBeenTransformed = this.imageSmoothingBeforeChanged() || hasImageBeenTransformed;

                    if(hasImageBeenTransformed){
                        sourceCanvas.context.drawImage(transformCanvasWebGl.canvas, 0, 0);
                    }
                }
                
                //load image into the webworkers
                imageId = WorkerUtil.generateImageId(imageId);
                const buffer = Canvas.createSharedImageBuffer(sourceCanvas);
                const ditherWorkerHeader = WorkerUtil.createLoadImageHeader(imageId, this.imageHeader.width, this.imageHeader.height);
                ditherWorkers.forEach((ditherWorker)=>{
                    //copy image to web workers
                    ditherWorker.postMessage(ditherWorkerHeader);
                    ditherWorker.postMessage(buffer);
                });
                if(notifyDitherSection){
                    this.activeDitherSection.imageLoaded(this.imageHeader);
                }
            },
            applyWebGlCanvasFilters: function(){
                const filters = this.imageFiltersRaw;
                //don't do anything if filters are all invalid or at defaults
                if(Object.keys(filters).length < 1){
                    return;
                }
                const imageHeader = this.imageHeader;
                WebGlCanvasFilters.filter(transformCanvasWebGl.gl, sourceWebglTexture, imageHeader.width, imageHeader.height, filters.contrast, filters.saturation, filters.brightness,filters.hue);
                sourceCanvas.context.drawImage(transformCanvasWebGl.canvas, 0, 0);
                transformCanvasWebGl.gl.deleteTexture(sourceWebglTexture);
                sourceWebglTexture = WebGl.createAndLoadTextureFromCanvas(transformCanvasWebGl.gl, sourceCanvas.canvas);
            },
            imagePixelationChanged: function(){
                const imageHeader = this.imageHeader;
                const scaleAmount = this.pixelateImageZoom / 100;
                const filters = this.areCanvasFiltersSupported ? this.imageFilters : '';
                Canvas.copy(originalImageCanvas, sourceCanvas, scaleAmount, filters);
                Canvas.copy(originalImageCanvas, transformCanvas, scaleAmount, filters);
                
                if(this.isWebglSupported){
                    transformCanvasWebGl.canvas.width = imageHeader.width;
                    transformCanvasWebGl.canvas.height = imageHeader.height;
                    transformCanvasWebGl.gl.deleteTexture(sourceWebglTexture);
                    sourceWebglTexture = WebGl.createAndLoadTextureFromCanvas(transformCanvasWebGl.gl, sourceCanvas.canvas);
                }
                //we have to unset hue-rotate here, otherwise it will remain set for some reason even though other filters reset
                //sourceCanvas filter needs to be reset after webgl texture is created, otherwise results of the filter won't be saved in the texture
                if(this.areCanvasFiltersSupported && transformCanvas.context.filter){
                    transformCanvas.context.filter = 'hue-rotate(0deg)';
                    sourceCanvas.context.filter = 'hue-rotate(0deg)';
                }
            },
            bilateralFilterValueChanged: function(){
                const filterExponent = this.bilateralFilterValues[this.selectedBilateralFilterValue];
                if(filterExponent < 0){
                    return false;
                }
                const imageHeader = this.imageHeader;
                sourceWebglTexture = WebGlBilateralFilter.filterImage(transformCanvasWebGl, sourceWebglTexture, imageHeader.width, imageHeader.height, filterExponent);
                return true;
            },
            //image smoothing after pixelation, before dither
            imageSmoothingBeforeChanged: function(){
                const smoothingRadius = this.imageSmoothingValues[this.selectedImageSmoothingRadiusBefore];
                if(!this.isSmoothingEnabled || smoothingRadius <= 0){
                    return false;
                }
                const imageHeader = this.imageHeader;
                //smoothing
                WebGlSmoothing.smooth(transformCanvasWebGl.gl, sourceWebglTexture, imageHeader.width, imageHeader.height, smoothingRadius);
                transformCanvasWebGl.gl.deleteTexture(sourceWebglTexture);
                sourceWebglTexture = WebGl.createAndLoadTextureFromCanvas(transformCanvasWebGl.gl, transformCanvasWebGl.canvas);
                
                return true;
            },
            //image smoothing after dither
            imageSmoothingAfterChanged: function(){
                const smoothingRadius = this.imageSmoothingValues[this.selectedImageSmoothingRadiusAfter];
                if(!this.isSmoothingEnabled || smoothingRadius <= 0){
                    return false;
                }
                const imageHeader = this.imageHeader;
                //smoothing
                WebGlSmoothing.smooth(transformCanvasWebGl.gl, ditherOutputWebglTexture, imageHeader.width, imageHeader.height, smoothingRadius);
                return true;
            },
            bilateralFilterValueAfterChanged: function(){
                const filterExponent = this.bilateralFilterValues[this.selectedBilateralFilterValueAfter];
                if(filterExponent < 0){
                    return false;
                }
                const imageHeader = this.imageHeader;
                ditherOutputWebglTexture = WebGlBilateralFilter.filterImage(transformCanvasWebGl, ditherOutputWebglTexture, imageHeader.width, imageHeader.height, filterExponent);

                return true;
            },
            imageFiltersAfterDitherChanged: function(){
                if(!this.isWebglSupported){
                    return;
                }
                transformCanvasWebGl.gl.deleteTexture(ditherOutputWebglTexture);
                ditherOutputWebglTexture = WebGl.createAndLoadTextureFromCanvas(transformCanvasWebGl.gl, ditherOutputCanvas.canvas);
                let hasImageBeenTransformed = false;
                hasImageBeenTransformed = this.bilateralFilterValueAfterChanged() || hasImageBeenTransformed;
                hasImageBeenTransformed = this.imageSmoothingAfterChanged() || hasImageBeenTransformed;
                if(hasImageBeenTransformed){
                    Canvas.copy(transformCanvasWebGl, transformCanvas);
                }
                else{
                    //reset output when no filters active
                    Canvas.copy(ditherOutputCanvas, transformCanvas);
                }
                //reset the outline, since it needs to be merged with transformCanvas
                this.imageOutlineFilterAction();
                this.zoomImage();
            },
            imageOutlineFilterAction: function(){
                if(!this.isImageOutlineFilterActive){
                    return;
                }
                if(this.isImageContourFilterActive){
                    this.imageContourFilterAction();
                }
                else{
                    this.imageEdgeFilterAction();
                }

                //merge on top of transformCanvas
                const blendMode = this.isImageOutlineFixedColor && this.areOutlineBlendModesSupported ? this.imageOutlineFixedColorBlendModes[this.selectedOutlineFixedColorBlendMode].value : null;
                Canvas.copy(transformCanvas, outlineFilterCanvas);
                Canvas.merge(transformCanvasWebGl, outlineFilterCanvas, blendMode);
            },
            imageContourFilterAction: function(){
                const imageWidth = this.imageHeader.width;
                const imageHeight = this.imageHeader.height;
                const radiusPercent = this.imageOutlineRadiusPercentages[this.selectedImageOutlineRadiusPercent];
                
                //better to use source texture as input instead of dither results, because there will be less noise in image outline 
                const inputTexture = sourceWebglTexture;
                // const originTexture = ditherOutputWebglTexture;
                WebGlImageOutline.outlineImage1(transformCanvasWebGl.gl, inputTexture, imageWidth, imageHeight, radiusPercent);
                const outline1OutputTexture = WebGl.createAndLoadTextureFromCanvas(transformCanvasWebGl.gl, transformCanvasWebGl.canvas);
                
                if(this.isImageOutlineFixedColor){
                    WebGlImageOutline.outlineImage2(transformCanvasWebGl.gl, outline1OutputTexture, imageWidth, imageHeight, radiusPercent, ColorPicker.colorsToVecArray([this.fixedOutlineColor], 1));
                }
                else{
                    const backgroundTexture = ditherOutputWebglTexture;
                    WebGlImageOutline.outlineImage2Background(transformCanvasWebGl.gl, outline1OutputTexture, imageWidth, imageHeight, radiusPercent, this.$refs.colorDitherSection.selectedColorsVec, backgroundTexture, this.selectedOutlineColorMode);
                    //don't delete ditherOutputTexture, since it is deleted automatically by filters after dither changed
                }
                transformCanvasWebGl.gl.deleteTexture(outline1OutputTexture);
            },
            imageEdgeFilterAction: function(){
                const imageWidth = this.imageHeader.width;
                const imageHeight = this.imageHeader.height;
                const strength = this.imageOutlineEdgeStrengths[this.selectedImageOutlineStrength];
                
                //better to use source texture as input instead of dither results, because there will be less noise in image outline 
                const inputTexture = sourceWebglTexture;
                
                if(this.isImageOutlineFixedColor){
                    WebGlImageEdge.edgeFixed(transformCanvasWebGl.gl, inputTexture, imageWidth, imageHeight, strength, this.selectedImageOutlineEdgeThickness, ColorPicker.colorsToVecArray([this.fixedOutlineColor], 1));
                }
                else{
                    const backgroundTexture = ditherOutputWebglTexture;
                    WebGlImageEdge.edgeBackground(transformCanvasWebGl.gl, inputTexture, imageWidth, imageHeight, strength, this.$refs.colorDitherSection.selectedColorsVec, backgroundTexture, this.selectedImageOutlineEdgeThickness, this.selectedOutlineColorMode);
                    //don't delete ditherOutputTexture, since it is deleted automatically by filters after dither changed
                }
            },
            /**
             * Color picker function for outline filter fixed color
             */
            colorPickerValueChanged: function(colorHex){
                this.fixedOutlineColor = colorHex;
            },
            colorPickerDone: function(colorHex){
                this.fixedOutlineColor = colorHex;
                this.shouldShowColorPicker = false;
            },
            areControlsPinned: function(){
                return getComputedStyle(this.$refs.controlsContainer).getPropertyValue('position') === 'fixed';
            },
            /**
             * Zoom stuff
             */
            zoomImage: function(){
                const scaleAmount = this.$refs.zoomBar.zoom / this.pixelateImageZoom;
                Canvas.copy(sourceCanvas, sourceCanvasOutput, scaleAmount);
                Canvas.copy(this.transformedSourceCanvas, transformCanvasOutput, scaleAmount);
            },
            onDimensionsRequestedForZoomFit: function(callback){
                const areControlsPinned = this.areControlsPinned();
                const controlsContainerWidth = areControlsPinned ? this.$refs.controlsContainer.offsetWidth : 0;
                const canvasMargin = this.showOriginalImage ? parseInt(getComputedStyle(this.$refs.sourceCanvasOutput).getPropertyValue('margin-right').replace(/[\D]/, '')) : 0;

                callback(areControlsPinned, controlsContainerWidth, canvasMargin);
            },
            cyclePropertyList: VueMixins.cyclePropertyList,
            
            //webworker stuff
            workerMessageReceivedDispatcher: function(e){
                const messageData = e.data;
                const messageFull = new Uint8Array(messageData);
                //get image id and messageTypeId from start of buffer
                const messageImageId = messageFull[0];
                //check for race condition where worker was working on old image
                if(messageImageId !== imageId){
                    return;
                }
                const messageTypeId = messageFull[1];
                //rest of the buffer is the actual pixel data
                const pixels = messageFull.subarray(2);
                switch(messageTypeId){
                    case WorkerHeaders.DITHER:
                    case WorkerHeaders.DITHER_BW:
                    case WorkerHeaders.HISTOGRAM:
                        this.$refs.bwDitherSection.ditherWorkerMessageReceivedDispatcher(messageTypeId, pixels);
                        break;
                    default:
                        this.$refs.colorDitherSection.ditherWorkerMessageReceivedDispatcher(messageTypeId, pixels);
                        break;
                }
            },
            onRequestDisplayTransformedImage: function(componentId){
                if(componentId === this.activeDitherComponentId){
                    if(this.isWebglEnabled){
                        //copy output to ditherOutputCanvas so we don't lose it for post filter dithers
                        Canvas.copy(transformCanvas, ditherOutputCanvas);
                        this.imageFiltersAfterDitherChanged();
                    }
                    this.zoomImage();
                }
            },
            onCanvasesRequested: function(componentId, callback){
                if(componentId === this.activeDitherComponentId){
                    callback(transformCanvas, transformCanvasWebGl, sourceWebglTexture);
                }
            },
            //used to build callback functions for onRequestDisplayTransformedImage and onCanvasesRequested
            //so that requester is not aware of, and thus cannot change their componentId
            requestPermissionCallbackBuilder: function(componentId, callback){
                return (...args)=>{
                    callback(componentId, ...args);
                };
            },
            onWorkerRequested: function(callback){
                let worker = ditherWorkers.getNextWorker();
                callback(worker);
            },
            showModalPrompt: function(...modalPromptArgs){
                this.$refs.modalPromptComponent.show(...modalPromptArgs);
            },
            /**
             * Image tab
             */
            imageFilterSteppedDropdownOption: function(index, offValue=0){
                return index === offValue ? 'None' : index;
            },
        }
    });
})(window.Vue, App.Canvas, App.WorkerUtil, App.WebGl, App.WorkerHeaders, App.Constants, App.VueMixins, App.EditorThemes, App.UserSettings, App.AlgorithmModel, App.WebGlSmoothing, App.WebGlBilateralFilter, App.WebGlCanvasFilters, App.ImageFiltersModel, App.WebGlImageOutline, App.ColorPicker, App.WebGlImageEdge);