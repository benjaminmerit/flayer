<div class="dither-controls-container controls-panel">
    <div class="spread-content">
        <label>Algorithm
            <select v-model="selectedDitherAlgorithmIndex">
                <optgroup v-for="ditherGroup in ditherGroups" v-bind:label="ditherGroup.title">
                    <option v-for="(ditherAlgorithm, index) in ditherAlgorithms.slice(ditherGroup.start, ditherGroup.start + ditherGroup.length)" v-bind:value="ditherGroup.start + index">{{ ditherAlgorithm.title }}</option>
                </optgroup>
            </select>
        </label>
        <div>
            <button class="shuffle-color-palette-button" title="Previous algorithm" @click="cyclePropertyList('selectedDitherAlgorithmIndex', -1, ditherAlgorithms.length)"><</button>
            <button class="shuffle-color-palette-button" title="Next algorithm" @click="cyclePropertyList('selectedDitherAlgorithmIndex', 1, ditherAlgorithms.length)">></button>
        </div>
    </div>
    <div>
        <label>
            Threshold
            <input type="number" v-bind:min="thresholdMin" v-bind:max="thresholdMax" v-model.number="threshold"/>
            <input type="range" v-bind:min="thresholdMin" v-bind:max="thresholdMax" v-model.number="threshold"/>
        </label>
    </div>
    <div>
        <button v-on:click="ditherImageWithSelectedAlgorithm" v-show="!isLivePreviewEnabled">Transform</button>
    </div>
    <div class="histogram-super-container">
        <div class="histogram-container" style="width: <?= HISTOGRAM_BW_WIDTH.'px'; ?>; height: <?= HISTOGRAM_HEIGHT.'px'; ?>;">
            <canvas ref="histogramCanvasIndicator" class="histogram-canvas-indicator" width="<?= HISTOGRAM_BW_WIDTH; ?>" height="<?= HISTOGRAM_HEIGHT; ?>" title="Lightness histogram"></canvas>
            <canvas ref="histogramCanvas" class="histogram-canvas" width="<?= HISTOGRAM_BW_WIDTH; ?>" height="<?= HISTOGRAM_HEIGHT; ?>" title="Lightness histogram"></canvas>
        </div>
    </div>

    <div class="color-replace-super-container">
        <div class="color-replace-title-container">
            <h5 class="color-replace-title">Color substitution</h5>
        </div>
        <label>Black<input type="color" v-model="colorReplaceColors[0]" /></label>
        <label>White<input type="color" v-model="colorReplaceColors[1]" /></label>
        <button v-on:click="resetColorReplace" v-show="areColorReplaceColorsChangedFromDefaults">Reset colors</button>
    </div>
    <div>
        <button v-on:click="saveTexture">Save texture</button>
        <button v-show="savedTextures.length >= 3" v-on:click="combineDitherTextures">Combine textures</button>
    </div>
</div>