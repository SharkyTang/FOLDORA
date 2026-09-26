// Geometry is measured in millimetres. The labelled dimensions come from the
// supplied dieline; unlabelled flap contours are traced proportionally from it.
export const DIECUT = Object.freeze({
  id: "snap-lock-90x90x235",
  name: "插接式锁底盒",
  viewBox: "-18 -19 411 443",
  dimensions: Object.freeze({ width: 90, depth: 90, height: 235, glue: 15 }),
  bodyTop: 120,
  bodyBottom: 355,
  panels: Object.freeze([
    { id: "left", label: "左侧", x: 15, y: 120, width: 90, height: 235 },
    { id: "back", label: "背面", x: 105, y: 120, width: 90, height: 235 },
    { id: "right", label: "右侧", x: 195, y: 120, width: 90, height: 235 },
    { id: "front", label: "正面", x: 285, y: 120, width: 90, height: 235 },
    { id: "top", label: "顶面", x: 285, y: 30, width: 90, height: 90 },
  ]),
  outerFaces: Object.freeze(["front", "back", "left", "right", "top", "bottom"]),
  // The perimeter includes the glue flap, two dust flaps, the perforated back
  // extension, the top closure and tuck, and four DIFFERENT snap-lock pieces.
  perimeter: [
    "M15 120 L7 120.5 Q3 121 0 124 L0 347 Q4 355 15 355",
    "L15 400 Q15 402 17 402 H35 Q36 402 36 400 V386 H84 V400 Q84 402 86 402 H103 Q105 402 105 400 V355",
    "L138 388 V400 Q138 402 140 402 H193 Q195 402 195 400 V355",
    "L218 388 V400 Q218 402 220 402 H263 Q265 402 265 400 V388 L285 355",
    "L318 388 V400 Q318 402 320 402 H363 Q365 402 365 400 L375 355",
    "L375 120 L375 35 Q375 31 372 30 L373 27 V9 Q373 -4 360 -4 H341 V-3 A11 11 0 0 1 319 -3 V-4 H300 Q287 -4 287 9 V27 L285 30 L285 120",
    "L270 89 H210 L195 120 L195 10 H105 V120 L90 89 H30 L15 120 Z",
  ].join(" "),
  backHole: "M164 71 A14 14 0 1 0 136 71 A14 14 0 1 0 164 71 Z",
  creases: Object.freeze([
    { id: "glue", x1: 15, y1: 120, x2: 15, y2: 355 },
    { id: "left-back", x1: 105, y1: 120, x2: 105, y2: 355 },
    { id: "back-right", x1: 195, y1: 120, x2: 195, y2: 355 },
    { id: "right-front", x1: 285, y1: 120, x2: 285, y2: 355 },
    { id: "top-left", x1: 15, y1: 120, x2: 105, y2: 120 },
    { id: "top-back", x1: 105, y1: 120, x2: 195, y2: 120 },
    { id: "top-right", x1: 195, y1: 120, x2: 285, y2: 120 },
    { id: "top-front", x1: 285, y1: 120, x2: 375, y2: 120 },
    { id: "bottom-left", x1: 15, y1: 355, x2: 105, y2: 355 },
    { id: "bottom-back", x1: 105, y1: 355, x2: 195, y2: 355 },
    { id: "bottom-right", x1: 195, y1: 355, x2: 285, y2: 355 },
    { id: "bottom-front", x1: 285, y1: 355, x2: 375, y2: 355 },
    { id: "back-crease-1", x1: 105, y1: 35, x2: 195, y2: 35 },
    { id: "back-crease-2", x1: 105, y1: 102, x2: 195, y2: 102 },
    { id: "tuck", x1: 285, y1: 30, x2: 375, y2: 30 },
  ]),
  flapPaths: Object.freeze({
    glue: "M15 0 L7 0.5 Q3 1 0 4 V227 Q4 235 15 235 Z",
    dust: "M0 31 L15 0 H75 L90 31 Z",
    tuck: "M0 34 L2 31 V13 Q2 0 15 0 H34 V1 A11 11 0 0 0 56 1 V0 H75 Q88 0 88 13 V31 L90 34 Z",
    bottomLeft: "M0 0 H90 V45 Q90 47 88 47 H71 Q69 47 69 45 V31 H21 V45 Q21 47 19 47 H2 Q0 47 0 45 Z",
    bottomBack: "M0 0 H90 L88 47 H35 Q33 47 33 45 V32 Z",
    bottomRight: "M0 0 H90 L68 32 V45 Q68 47 66 47 H24 Q22 47 22 45 V32 Z",
    bottomFront: "M0 0 H90 L82 47 H34 Q32 47 32 45 V32 Z",
  }),
});

export const DIECUTS = Object.freeze({ [DIECUT.id]: DIECUT });
