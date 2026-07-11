# OcuRead

**Webcam-based eye-tracking to detect reading stress — no dedicated hardware needed.**

OcuRead is a browser app that figures out where a reader is looking on screen using
nothing more than a normal webcam. While someone reads a passage, it tracks their eye
movements and turns them into a few behavioural signals — blink rate, how scattered the
gaze is, how far the eyes jump, and how much time they spend in the lower part of the
screen — which it combines into a single stress index.

We built it for the Research Methodology course (Prof. Andrea Morichetta, University of
Camerino), and it's the system behind our paper of the same name.

## How it works

Everything happens in the browser. The webcam video never leaves your device — only the
anonymized summary numbers of each session get saved. The pipeline goes through four
steps:

1. **Face tracking** — MediaPipe Face Landmarker finds 478 points on the face and the
   blink signals, frame by frame.
2. **Gaze estimation** — a small model, calibrated for each person at the start, turns
   those face points into a position on the screen.
3. **Behaviour analysis** — the gaze data is split into fixations and saccades, and from
   there we compute the metrics and the stress index.
4. **Visualisation** — the results come back as a gaze heatmap over the text and a
   stress gauge.

Right before reading, each person does a quick nine-point calibration (a 3×3 grid) so
the model adapts to their face, their distance from the screen, and the lighting.

## Project structure
index.html            Main interface
css/style.css         Styles
js/
├── main.js           Entry point
├── app.js            Overall coordination and app state
├── core/
│   ├── face-tracker.js          Face and blink detection
│   ├── gaze-model.js            Gaze model and ridge regression
│   ├── calibration-manager.js   Nine-point calibration
│   ├── stress-analyzer.js       Fixations, saccades and stress index
│   └── test-session-manager.js  Reading-session handling
├── services/
│   ├── firebase.js              Session storage on Firestore
│   ├── exporter.js              Data export (CSV/JSON)
│   ├── library.js               Text management
│   └── pdf-reader.js            Loading texts from PDF
├── ui/
│   └── visualizer.js            Heatmap and gauges
└── utils/
├── stats.js                 Statistical helpers
├── filters.js               Sample filtering
├── dom.js                   DOM utilities
└── text-util.js             Text handling

## Running it

The app is fully client-side, so there's nothing to build. You just need to serve the
folder over a local server — opening `index.html` directly won't work, because the code
is split into ES modules that browsers only load over HTTP.

We use [`serve`](https://www.npmjs.com/package/serve). Install it once, then run it from
the project folder:

```bash
npm install -g serve
serve .
```

Then open the address it prints (usually `http://localhost:3000`) in a recent Chrome or
Edge.

The browser will ask for webcam permission the first time — you have to allow it for the
tracking to work. For the best results, sit in a well-lit room, keep your face centred
and facing the camera, and try not to move your head too much while you read.

## Requirements

- A recent browser with WebAssembly and ES module support (Chrome or Edge).
- A webcam.
- [Node.js](https://nodejs.org) (to run `serve`).
- An internet connection — MediaPipe and Firebase load from a CDN, so there's nothing
  to install by hand.

## Data and privacy

The webcam feed is processed locally and never uploaded. The only thing that reaches
Firestore is each session's summary — metrics, quiz score, calibration quality — all
anonymized. You can export everything to CSV or JSON for analysis.

## License

Released under the GNU GPL v3.0. See the [LICENSE](LICENSE) file for details.

## Authors

Daniela Maria Di Lucchio, Lorenzo Marcantognini, and Marco Francoletti — Research
Methodology, University of Camerino.