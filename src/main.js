import { Renderer } from './renderer.js'

const canvas = document.querySelector("canvas");
const renderer = new Renderer(canvas);

await renderer.Initialize();
renderer.run();