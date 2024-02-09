"use client";
import { P5CanvasInstance, SketchProps } from "@p5-wrapper/react";
import { NextReactP5Wrapper } from "@p5-wrapper/next";

export type CloudBubbleSketchProps = {
  clouds: number;
  play: boolean;
};

function sketch(p5: P5CanvasInstance<SketchProps & CloudBubbleSketchProps>) {
  // inspired by: https://openprocessing.org/sketch/1786759
  let play = false;
  let clouds = 0;
  let cloudsColor1 = 0;
  let cloudsColor2 = 256;

  let [width, height] = [p5.windowWidth, p5.windowHeight];
  let canvas: any | null = null;

  class Particle {
    posx: number;
    posy: number;
    velx = 0;
    vely = 0;
    accx = 0;
    accy = 0;
    gravity = 0;
    radius = p5.random(width / 60, width / 20);
    color = p5.color(p5.random(cloudsColor1, cloudsColor2));

    constructor(x: number, y: number) {
      this.posx = x;
      this.posy = y;
    }

    show() {
      p5.fill(this.color);
      p5.ellipse(this.posx, this.posy, this.radius * 2);
    }
  }

  const system = {
    particles: [] as Particle[],

    spawn(x: number, y: number) {
      for (let i = clouds; i--; ) {
        const a = p5.random(p5.TWO_PI);
        this.particles.push(new Particle(x + p5.cos(a), y + p5.sin(a)));
      }
    },

    avoidOverlap() {
      for (let i = this.particles.length; i--; ) {
        const current = this.particles[i];
        for (let j = i; j--; ) {
          const other = this.particles[j];
          const dx = current.posx - other.posx;
          const dy = current.posy - other.posy;
          const distance = p5.sqrt(dx * dx + dy * dy);
          const sumRadius = current.radius + other.radius;
          if (distance < sumRadius) {
            let strength = 1 - distance / sumRadius;
            strength *= 0.25;
            current.accx += dx * strength;
            current.accy += dy * strength;
            other.accx -= dx * strength;
            other.accy -= dy * strength;
          }
        }
      }
    },

    update() {
      for (const b of this.particles) {
        b.gravity += 0.01;
        b.velx += b.accx;
        b.vely += b.accy;
        b.posx += b.velx;
        b.posy += b.vely + b.gravity;
        b.velx *= 0.5;
        b.vely *= 0.5;
        b.accx = 0;
        b.accy = 0;
        b.show();
      }
      this.particles = this.particles.filter((b) => {
        b.radius *= 0.995;
        return b.radius > 2 && b.posy - b.radius < height;
      });
    },
  };

  p5.setup = () => {
    if (!play) p5.noLoop();
    canvas = p5.createCanvas(width, height, p5.P2D);
    p5.noStroke();
  };

  p5.updateWithProps = (props: any) => {
    clouds = props.clouds;
    play = props.play;

    if (props.play) {
      p5.loop();
    } else {
      p5.noLoop();
    }
  };

  p5.draw = () => {
    if (clouds <= 5) {
      clouds = 5;
      p5.background("#75c2f6");
      cloudsColor1 = 192;
      cloudsColor2 = 256;
    } else if (clouds <= 20) {
      p5.background("#93b5c6");
      cloudsColor1 = 128;
      cloudsColor2 = 192;
    } else if (clouds <= 50) {
      p5.background("#c9ccd5");
      cloudsColor1 = 64;
      cloudsColor2 = 128;
    } else {
      clouds = 50;
      p5.background("#aaaaaa");
      cloudsColor1 = 0;
      cloudsColor2 = 64;
    }

    system.avoidOverlap();
    system.update();
    p5.frameCount % 20 == 0 &&
      system.spawn(p5.random(width), p5.random(height / 2));
  };
}

export default function CloudBubbleSketch(props: CloudBubbleSketchProps) {
  return <NextReactP5Wrapper sketch={sketch} {...props} />;
}
