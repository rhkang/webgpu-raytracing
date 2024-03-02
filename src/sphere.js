export class Sphere {
    center;
    radius;

    constructor(center, radius) {
        this.center = new Float32Array(center);
        this.radius = radius;
    }
}