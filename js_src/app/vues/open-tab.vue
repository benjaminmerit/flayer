<template>
  <div class="controls-tab-container" :class="$style.container">
    <fieldset>
      <legend>Upload image from device</legend>
      <button
        class="btn btn-primary"
        @click="openDeviceImage"
        title="Open local image file"
      >
        Image file
      </button>
      <button
        class="btn btn-default"
        @click="batchOpenDeviceImages"
        title="Automatically dither multiple files"
        v-if="isBatchConvertEnabled"
      >
        Batch convert image files
      </button>
      <input
        type="file"
        @change.prevent="onFileInputChange($event)"
        ref="fileInput"
        v-show="false"
      />
      <input
        type="file"
        @change.prevent="onBatchFileInputChange($event)"
        ref="batchFileInput"
        v-show="false"
        multiple
      />
    </fieldset>
    <fieldset>
      <legend>Load image from link</legend>
      <button
        class="btn btn-default"
        @click="showOpenImageUrlPrompt"
        :disabled="isCurrentlyLoadingImageUrl"
        title="Open image from Url"
      >
        Image url
      </button>
      <!-- <button 
                class="btn btn-default" 
                @click="openRandomImage" 
                :disabled="isCurrentlyLoadingImageUrl" 
                title="Open random image from Unsplash"
            >
                Random image
            </button> -->
    </fieldset>
  </div>
</template>

<style lang="scss" module>
.container {
  button + button {
    margin-left: 0.5rem;
  }
}
</style>

<script>
import Fs from "../fs.js";
import RandomImage from "../random-image.js";

export default {
  props: {
    imageOpened: {
      type: Function,
      required: true,
    },
    onBatchFilesSelected: {
      type: Function,
      required: true,
    },
    openImageError: {
      type: Function,
      required: true,
    },
    requestModal: {
      type: Function,
      required: true,
    },
    isBatchConvertEnabled: {
      type: Boolean,
      required: true,
    },
  },
  data() {
    return {
      isCurrentlyLoadingImageUrl: false,
    };
  },
  methods: {
    openDeviceImage() {
      this.$refs.fileInput.click();
    },
    batchOpenDeviceImages() {
      this.$refs.batchFileInput.click();
    },
    onBatchFileInputChange($event) {
      const fileInput = $event.target;
      const files = Array.from(fileInput.files).filter((file) =>
        Fs.isImageFile(file)
      );
      if (files.length === 0) {
        return this.openImageError("No image files selected");
      }
      this.onBatchFilesSelected(files);
      // clear input so the same files can be re-selected
      $event.target.value = "";
    },
    onFileInputChange($event) {
      const fileInput = $event.target;

      Fs.openImageFile(fileInput.files[0])
        .catch(this.openImageError)
        .then(([imageElement, file]) => this.imageOpened(imageElement, file));

      fileInput.value = "";
    },
    openImageFromUrlFailed(error, imageUrl) {
      this.openImageError(Fs.messageForOpenImageUrlError(error, imageUrl));
      this.isCurrentlyLoadingImageUrl = false;
    },
    showOpenImageUrlPrompt() {
      this.requestModal("Image Url", "", this.openImageUrl, {
        okButtonValue: "Open",
        inputType: "url",
        placeholder: "http://example.com/image.jpg",
      });
    },
    openImageUrl(imageUrl) {
      if (!imageUrl) {
        return;
      }
      this.isCurrentlyLoadingImageUrl = true;
      Fs.openImageUrl(imageUrl)
        .then(({ image, file }) => {
          this.imageOpened(image, file);
          this.isCurrentlyLoadingImageUrl = false;
        })
        .catch((error) => {
          this.openImageFromUrlFailed(error, imageUrl);
        });
    },
    openRandomImage() {
      this.isCurrentlyLoadingImageUrl = true;

      RandomImage.get(window.innerWidth, window.innerHeight)
        .then(({ image, file }) => {
          this.imageOpened(image, file);
          this.isCurrentlyLoadingImageUrl = false;
        })
        .catch(this.openImageFromUrlFailed);
    },
  },
};
</script>
