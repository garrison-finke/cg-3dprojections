import * as CG from './transforms.js';
import { Matrix, Vector } from "./matrix.js";

const LEFT =   32; // binary 100000
const RIGHT =  16; // binary 010000
const BOTTOM = 8;  // binary 001000
const TOP =    4;  // binary 000100
const FAR =    2;  // binary 000010
const NEAR =   1;  // binary 000001
const FLOAT_EPSILON = 0.000001;

class Renderer {
    // canvas:              object ({id: __, width: __, height: __})
    // scene:               object (...see description on Canvas)
    constructor(canvas, scene) {
        this.canvas = document.getElementById(canvas.id);
        this.canvas.width = canvas.width;
        this.canvas.height = canvas.height;
        this.ctx = this.canvas.getContext('2d');
        this.scene = this.processScene(scene);
        this.enable_animation = false;  // <-- disabled for easier debugging; enable for animation
        this.start_time = null;
        this.prev_time = null;
    }

    //
    updateTransforms(time, delta_time) {
        // TODO: update any transformations needed for animation
    }

    //
    rotateLeft() {

    }
    
    //
    rotateRight() {

    }
    
    //
    moveLeft() {
        let n = this.scene.view.prp.subtract(this.scene.view.srp);
        n.normalize();
        let u = this.scene.view.vup.cross(n);
        u.normalize();
        this.scene.view.prp = this.scene.view.prp.subtract(u);
        this.scene.view.srp = this.scene.view.srp.subtract(u);
        this.draw();
    }
    
    //
    moveRight() {
        let n = this.scene.view.prp.subtract(this.scene.view.srp);
        n.normalize();
        let u = this.scene.view.vup.cross(n);
        u.normalize();
        this.scene.view.prp = this.scene.view.prp.add(u);
        this.scene.view.srp = this.scene.view.srp.add(u);
        this.draw();
    }
    
    //
    moveBackward() {
        let n = this.scene.view.prp.subtract(this.scene.view.srp);
        n.normalize();
        this.scene.view.prp = this.scene.view.prp.add(n);
        this.scene.view.srp = this.scene.view.srp.add(n);
        this.draw();
    }
    
    //
    moveForward() {
        // n points from SRP toward PRP, so forward is -n
        let n = this.scene.view.prp.subtract(this.scene.view.srp);
        n.normalize();
        this.scene.view.prp = this.scene.view.prp.subtract(n);
        this.scene.view.srp = this.scene.view.srp.subtract(n);
        this.draw();
    }

    //
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        let view = this.scene.view;
        let n_per = CG.mat4x4Perspective(view.prp, view.srp, view.vup, view.clip);
        let m_per = CG.mat4x4MPer();
        let viewport = CG.mat4x4Viewport(this.canvas.width, this.canvas.height);
        let z_min = -view.clip[4] / view.clip[5];

        for (let i = 0; i < this.scene.models.length; i++) {
            let model = this.scene.models[i];
            if (model.type !== 'generic') {
                continue;
            }

            let transformed = [];
            for (let j = 0; j < model.vertices.length; j++) {
                transformed.push(Matrix.multiply([n_per, model.matrix, model.vertices[j]]));
            }

            for (let j = 0; j < model.edges.length; j++) {
                let edge = model.edges[j];
                for (let k = 0; k < edge.length - 1; k++) {
                    let line = {pt0: transformed[edge[k]], pt1: transformed[edge[k + 1]]};
                    line = this.clipLinePerspective(line, z_min);
                    if (line === null) {
                        continue;
                    }

                    let p0 = Matrix.multiply([viewport, m_per, line.pt0]);
                    let p1 = Matrix.multiply([viewport, m_per, line.pt1]);

                    // divide by w to get cartesian coords
                    let x0 = p0.x / p0.w;
                    let y0 = p0.y / p0.w;
                    let x1 = p1.x / p1.w;
                    let y1 = p1.y / p1.w;
                    this.drawLine(x0, y0, x1, y1);
                }
            }
        }
    }

    // Get outcode for a vertex
    // vertex:       Vector4 (transformed vertex in homogeneous coordinates)
    // z_min:        float (near clipping plane in canonical view volume)
    outcodePerspective(vertex, z_min) {
        let outcode = 0;
        if (vertex.x < (vertex.z - FLOAT_EPSILON)) {
            outcode += LEFT;
        }
        else if (vertex.x > (-vertex.z + FLOAT_EPSILON)) {
            outcode += RIGHT;
        }
        if (vertex.y < (vertex.z - FLOAT_EPSILON)) {
            outcode += BOTTOM;
        }
        else if (vertex.y > (-vertex.z + FLOAT_EPSILON)) {
            outcode += TOP;
        }
        if (vertex.z < (-1.0 - FLOAT_EPSILON)) {
            outcode += FAR;
        }
        else if (vertex.z > (z_min + FLOAT_EPSILON)) {
            outcode += NEAR;
        }
        return outcode;
    }

    // Clip line - should either return a new line (with two endpoints inside view volume)
    //             or null (if line is completely outside view volume)
    // line:         object {pt0: Vector4, pt1: Vector4}
    // z_min:        float (near clipping plane in canonical view volume)
    clipLinePerspective(line, z_min) {
        let result = null;
        let p0 = CG.Vector4(line.pt0.x, line.pt0.y, line.pt0.z, 1);
        let p1 = CG.Vector4(line.pt1.x, line.pt1.y, line.pt1.z, 1);
        let out0 = this.outcodePerspective(p0, z_min);
        let out1 = this.outcodePerspective(p1, z_min);

        while (true) {
            // trivial accept
            if ((out0 | out1) === 0) {
                result = {pt0: p0, pt1: p1};
                break;
            }
            // trivial reject
            if ((out0 & out1) !== 0) {
                break;
            }

            // pick an endpoint that is outside
            let out = (out0 !== 0) ? out0 : out1;
            let dx = p1.x - p0.x;
            let dy = p1.y - p0.y;
            let dz = p1.z - p0.z;
            let t;

            if (out & LEFT) {
                t = (-p0.x + p0.z) / (dx - dz);
            }
            else if (out & RIGHT) {
                t = (p0.x + p0.z) / (-dx - dz);
            }
            else if (out & BOTTOM) {
                t = (-p0.y + p0.z) / (dy - dz);
            }
            else if (out & TOP) {
                t = (p0.y + p0.z) / (-dy - dz);
            }
            else if (out & FAR) {
                t = (-p0.z - 1) / dz;
            }
            else {
                t = (p0.z - z_min) / (-dz);
            }

            let pt = CG.Vector4(p0.x + t * dx, p0.y + t * dy, p0.z + t * dz, 1);
            if (out === out0) {
                p0 = pt;
                out0 = this.outcodePerspective(p0, z_min);
            }
            else {
                p1 = pt;
                out1 = this.outcodePerspective(p1, z_min);
            }
        }

        return result;
    }

    //
    animate(timestamp) {
        // Get time and delta time for animation
        if (this.start_time === null) {
            this.start_time = timestamp;
            this.prev_time = timestamp;
        }
        let time = timestamp - this.start_time;
        let delta_time = timestamp - this.prev_time;

        // Update transforms for animation
        this.updateTransforms(time, delta_time);

        // Draw slide
        this.draw();

        // Invoke call for next frame in animation
        if (this.enable_animation) {
            window.requestAnimationFrame((ts) => {
                this.animate(ts);
            });
        }

        // Update previous time to current one for next calculation of delta time
        this.prev_time = timestamp;
    }

    //
    updateScene(scene) {
        this.scene = this.processScene(scene);
        if (!this.enable_animation) {
            this.draw();
        }
    }

    //
    processScene(scene) {
        let processed = {
            view: {
                prp: CG.Vector3(scene.view.prp[0], scene.view.prp[1], scene.view.prp[2]),
                srp: CG.Vector3(scene.view.srp[0], scene.view.srp[1], scene.view.srp[2]),
                vup: CG.Vector3(scene.view.vup[0], scene.view.vup[1], scene.view.vup[2]),
                clip: [...scene.view.clip]
            },
            models: []
        };

        for (let i = 0; i < scene.models.length; i++) {
            let model = { type: scene.models[i].type };
            if (model.type === 'generic') {
                model.vertices = [];
                model.edges = JSON.parse(JSON.stringify(scene.models[i].edges));
                for (let j = 0; j < scene.models[i].vertices.length; j++) {
                    model.vertices.push(CG.Vector4(scene.models[i].vertices[j][0],
                                                   scene.models[i].vertices[j][1],
                                                   scene.models[i].vertices[j][2],
                                                   1));
                    if (scene.models[i].hasOwnProperty('animation')) {
                        model.animation = JSON.parse(JSON.stringify(scene.models[i].animation));
                    }
                }
            }
            else {
                model.center = CG.Vector4(scene.models[i].center[0],
                                         scene.models[i].center[1],
                                         scene.models[i].center[2],
                                         1);
                for (let key in scene.models[i]) {
                    if (scene.models[i].hasOwnProperty(key) && key !== 'type' && key != 'center') {
                        model[key] = JSON.parse(JSON.stringify(scene.models[i][key]));
                    }
                }
            }

            model.matrix = new Matrix(4, 4);
            processed.models.push(model);
        }

        return processed;
    }
    
    // x0:           float (x coordinate of p0)
    // y0:           float (y coordinate of p0)
    // x1:           float (x coordinate of p1)
    // y1:           float (y coordinate of p1)
    drawLine(x0, y0, x1, y1) {
        this.ctx.strokeStyle = '#000000';
        this.ctx.beginPath();
        this.ctx.moveTo(x0, y0);
        this.ctx.lineTo(x1, y1);
        this.ctx.stroke();

        this.ctx.fillStyle = '#FF0000';
        this.ctx.fillRect(x0 - 2, y0 - 2, 4, 4);
        this.ctx.fillRect(x1 - 2, y1 - 2, 4, 4);
    }
};

export { Renderer };
