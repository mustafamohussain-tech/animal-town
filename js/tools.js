// Things characters hold in their hands. Built pointing forward (+z) from the fist.
import * as THREE from 'three';
import { box, cyl, ball, mesh, sphere, torusGeo, tube, pick, shadows } from './util.js';

export function makeTool(name) {
  const g = new THREE.Group();
  switch (name) {
    case 'hammer':
      cyl(.03, .03, .5, '#8b5a2b', 0, 0, .18, g).rotation.x = Math.PI / 2;
      box(.1, .1, .22, '#6d7380', 0, 0, .42, g).rotation.y = Math.PI / 2;
      break;
    case 'hoe':
      cyl(.025, .025, 1.1, '#a0703f', 0, 0, .3, g).rotation.x = Math.PI / 2;
      box(.24, .2, .03, '#7d848f', 0, -.1, .84, g);
      break;
    case 'ladle':
      cyl(.02, .02, .45, '#c0c6cf', 0, 0, .2, g).rotation.x = Math.PI / 2;
      ball(.08, '#c0c6cf', 0, -.04, .44, g).scale.set(1, .6, 1);
      break;
    case 'rod': {
      const r = new THREE.Group();
      r.rotation.x = -.6;
      g.add(r);
      cyl(.022, .012, 1.7, '#5a3b22', 0, 0, .8, r).rotation.x = Math.PI / 2;
      ball(.04, '#d0d0d0', 0, -.05, .1, r);
      break;
    }
    case 'hose':
      cyl(.05, .035, .32, '#d4d4d4', 0, 0, .16, g).rotation.x = Math.PI / 2;
      tube([[0, 0, 0], [0, -.25, -.1], [0, -.5, -.35]], .035, '#c0392b', g);
      break;
    case 'pointer':
      cyl(.012, .012, .7, '#8b5a2b', 0, 0, .3, g).rotation.x = Math.PI / 2;
      ball(.022, '#e74c3c', 0, 0, .66, g);
      break;
    case 'clipboard':
      box(.24, .3, .025, '#8b5a2b', 0, .05, .1, g).rotation.x = -.4;
      box(.2, .24, .03, '#ffffff', 0, .06, .11, g).rotation.x = -.4;
      break;
    case 'food': {
      const f = new THREE.Group();
      f.position.set(0, 0, .1);
      g.add(f);
      cyl(.08, .08, .04, '#d8a35c', 0, 0, 0, f);
      cyl(.085, .085, .03, '#5a3420', 0, .035, 0, f);
      cyl(.09, .09, .012, '#5cb85c', 0, .055, 0, f);
      ball(.08, '#d8a35c', 0, .07, 0, f).scale.set(1, .6, 1);
      break;
    }
    case 'fish':
      mesh(sphere(.09), '#7fb8e0', 0, -.04, .16, g).scale.set(.55, 1, 2);
      mesh(sphere(.06), '#5a9cc8', 0, -.04, -.04, g).scale.set(.3, 1, .6);
      break;
    case 'umbrella': {
      const c = pick(['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#2ecc71']);
      cyl(.02, .02, 1.6, '#555555', 0, .75, 0, g, 6);
      mesh(new THREE.ConeGeometry(1.1, .45, 10), c, 0, 1.6, 0, g);
      break;
    }
    case 'broom':
      cyl(.025, .025, 1.2, '#a0703f', 0, 0, .35, g).rotation.x = Math.PI / 2;
      box(.35, .18, .25, '#d9b45a', 0, -.05, .95, g);
      break;
    case 'bag': {
      const c = pick(['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#2ecc71']);
      box(.24, .28, .12, c, 0, -.2, 0, g);
      mesh(torusGeo(.07, .012, 6, 16), c, 0, -.05, 0, g);
      break;
    }
  }
  shadows(g);
  return g;
}
