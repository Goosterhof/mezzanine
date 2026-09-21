// The rival's silhouette: swept ink hair, a pointed chin and a cutaway coat.
// Shares the scientist's moving joints so every activity remains alive.
import {AMBER, INK, type Pt, type SketchPen} from './pen';

export function drawHereticCoat(pen: SketchPen, shoulder: Pt, hip: Pt, flap: number): void {
    const s = pen.s;
    const [x, y] = shoulder;
    const [hx, hy] = hip;
    // High collar, fitted shoulders, asymmetric tails: legible without colour.
    pen.stroke(
        [
            [x - 6 * s, y - 9 * s],
            [x - 12 * s, y - 11 * s],
            [x - 12 * s, y],
            [x - 18 * s, y + 3 * s],
            [hx - 14 * s, hy - 3 * s],
            [hx - 22 * s - flap, hy + 28 * s],
            [hx - 3 * s, hy + 17 * s],
            [hx + 5 * s, hy + 5 * s],
            [hx + 17 * s + flap, hy + 21 * s],
            [hx + 14 * s, hy - 3 * s],
            [x + 18 * s, y + 3 * s],
            [x + 11 * s, y],
            [x + 11 * s, y - 11 * s],
            [x + 6 * s, y - 8 * s],
        ],
        2.6,
    );
    // Dark waistcoat, drawn with ink hatching rather than an opaque flat fill.
    for (let i = 0; i < 10; i++) {
        const yy = y + (9 + i * 3.5) * s;
        pen.line(x - 7 * s, yy, x + 6 * s, yy + 5 * s, 1.6, INK, 0.7);
    }
    pen.stroke(
        [
            [x - 12 * s, y],
            [x - 6 * s, y + 18 * s],
            [hx + 6 * s, hy - 8 * s],
        ],
        2,
    );
    pen.stroke(
        [
            [x + 11 * s, y],
            [x + 7 * s, y + 15 * s],
            [hx - 5 * s, hy - 6 * s],
        ],
        2,
    );
    // Amber neck wrap and wind-caught tail, drawn outside the torso contour.
    pen.line(x - 7 * s, y - 4 * s, x + 7 * s, y - 2 * s, 5, AMBER);
    pen.stroke(
        [
            [x + 7 * s, y - 3 * s],
            [x + 23 * s + flap, y + 3 * s],
            [x + 31 * s + flap, y + 16 * s],
            [x + 21 * s + flap, y + 11 * s],
            [x + 7 * s, y + 1 * s],
        ],
        2.5,
        AMBER,
    );
}

export function drawHereticHead(pen: SketchPen, x: number, y: number): void {
    const s = pen.s;
    const at = (dx: number, dy: number): Pt => [x + dx * s, y + dy * s];
    // Angular jaw replaces the original scientist's round head.
    pen.stroke([at(-16, -10), at(-17, 5), at(-11, 16), at(2, 22), at(14, 13), at(17, -6)], 2.6);
    pen.curve(at(-17, 0), at(-24, -3), at(-19, 8), 1.8);
    // One swept, dark quiff instead of the scientist's radial explosion.
    pen.stroke(
        [
            at(-17, -1),
            at(-22, -16),
            at(-14, -28),
            at(-4, -26),
            at(20, -32),
            at(14, -22),
            at(25, -23),
            at(17, -13),
            at(6, -10),
            at(-5, -15),
            at(-13, -8),
            at(-17, -1),
        ],
        2.8,
    );
    for (let i = 0; i < 8; i++) {
        pen.curve(
            at(-17 + i * 1.7, -8 - i * 1.5),
            at(-13 + i * 2, -21),
            at(14 + i * 0.5, -26 + i * 1.5),
            2.2,
            INK,
            0.85,
        );
    }
    // A single amber eyeglass: the other brow stays free to express doubt.
    pen.wash(x + 6 * s, y + 2 * s, 6 * s, AMBER, 0.17);
    pen.ellipse(x + 6 * s, y + 2 * s, 7 * s, 6.5 * s, 1.7, AMBER);
    pen.line(x + 13 * s, y + 1 * s, x + 17 * s, y - 2 * s, 1.5);
}
