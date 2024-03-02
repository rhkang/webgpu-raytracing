import raytracing_shader from "./shaders/raytracing.wgsl";
import screen_shader from "./shaders/screen.wgsl";
import { Sphere } from "./sphere.js";

export class Renderer {
    canvas;
    adapter;
    device;
    context;
    canvasFormat;

    // compute
    compute_bind_group;
    compute_pipeline;
    compute_object_buffer;

    // rendering
    screen_bind_group;
    color_buffer_view;
    color_buffer;
    screen_pipeline;

    constructor(canvas) {
        this.canvas = canvas;
        this.canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    }

    async Initialize() {
        if (!navigator.gpu) {
            throw new Error("WebGPU not supported on this browser.");
        }

        var adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            throw new Error("Fail to find Adapter.");
        }

        var device = await adapter.requestDevice({ requiredFeatures: ['bgra8unorm-storage'] });
        if (!device) {
            throw new Error("Fail to create Device.");
        }

        var context = this.canvas.getContext("webgpu");
        if (!context) {
            throw new Error("Fail to get WebGPU Context");
        }

        context.configure({
            device: device,
            format: this.canvasFormat,
        });

        this.adapter = adapter;
        this.device = device;
        this.context = context;
    }

    async prepareCompute() {
        const compute_bind_group_layout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: {
                        access: "write-only",
                        format: 'rgba8unorm',
                        viewDimension: "2d"
                    }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: {
                        type: "read-only-storage",
                        hasDynamicOffset: false
                    }
                }
            ],
        });

        this.color_buffer = this.device.createTexture({
            size: {
                width: this.canvas.width,
                height: this.canvas.height,
            },
            format: 'rgba8unorm',
            usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
        });

        this.color_buffer_view = this.color_buffer.createView();

        this.compute_object_buffer = this.device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        this.compute_bind_group = this.device.createBindGroup({
            layout: compute_bind_group_layout,
            entries: [
                {
                    binding: 0,
                    resource: this.color_buffer_view
                },
                {
                    binding: 1,
                    resource: {
                        buffer: this.compute_object_buffer
                    }
                }
            ]
        });

        this.compute_pipeline = this.device.createComputePipeline({
            compute: {
                module: this.device.createShaderModule({
                    code: raytracing_shader,
                }),
                entryPoint: 'main'
            },
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [compute_bind_group_layout],
            }),
        });
    }

    async prepareScreen() {
        const sampler = this.device.createSampler({
            addressModeU: "repeat",
            addressModeV: "repeat",
            magFilter: "linear",
            minFilter: "linear",
            mipmapFilter: "linear",
            maxAnisotropy: 1
        });

        const screen_bind_group_layout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {}
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {}
                }
            ]
        });

        this.screen_bind_group = this.device.createBindGroup({
            layout: screen_bind_group_layout,
            entries: [
                {
                    binding: 0,
                    resource: sampler,
                },
                {
                    binding: 1,
                    resource: this.color_buffer_view,
                },
            ]
        });

        const screen_pipeline_layout = this.device.createPipelineLayout({
            bindGroupLayouts: [screen_bind_group_layout]
        });

        this.screen_pipeline = this.device.createRenderPipeline({
            layout: screen_pipeline_layout,
            vertex: {
                module: this.device.createShaderModule({
                    code: screen_shader
                }),
                entryPoint: 'vs_main'
            },
            fragment: {
                module: this.device.createShaderModule({
                    code: screen_shader
                }),
                entryPoint: 'fg_main',
                targets: [
                    {
                        format: this.canvasFormat
                    }
                ]
            },
            primitive: {
                topology: "triangle-list"
            }
        });
    }

    async createScene() {
    }

    async updateScene() {
        const data = new Sphere([3, 0, 0], 0.5);
        this.device.queue.writeBuffer(this.compute_object_buffer, 0,
            new Float32Array(
                [
                    data.center[0],
                    data.center[1],
                    data.center[2],
                    data.radius,
                ]
            ), 0, 4);
    }

    render = () => {
        let start = performance.now();

        this.updateScene();

        var encoder = this.device.createCommandEncoder();

        // compute
        var computePass = encoder.beginComputePass();
        computePass.setPipeline(this.compute_pipeline);
        computePass.setBindGroup(0, this.compute_bind_group);
        computePass.dispatchWorkgroups(
            this.canvas.width / 8,
            this.canvas.height / 8,
            1
        );
        computePass.end();

        // rendering
        var renderPass = encoder.beginRenderPass({
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                loadOp: "clear",
                storeOp: "store",
                clearValue: { r: 0.4, g: 0.6, b: 0.8, a: 1 },
            }],
        });

        renderPass.setPipeline(this.screen_pipeline);
        renderPass.setBindGroup(0, this.screen_bind_group);
        renderPass.draw(6, 1, 0, 0);    // rectangle (triangle x 2) to cover the screen

        renderPass.end();

        this.device.queue.submit([encoder.finish()]);

        this.device.queue.onSubmittedWorkDone().then(() => {
            let elapsed = performance.now() - start;
            // console.log("Time Elapsed: %s", elapsed);
        });

        requestAnimationFrame(this.render);
    };

    async run() {
        await this.prepareCompute();
        await this.prepareScreen();
        requestAnimationFrame(this.render);
    }
}