import Vue from 'vue';
import DitherStudio from './app/vues/dither-studio-component.js';

new Vue({
    el: '#app',
    render: h => h(DitherStudio),
});