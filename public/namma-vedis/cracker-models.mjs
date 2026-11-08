import * as THREE from 'three';

// Real, closed geometry in meters. Textures decorate opaque surfaces; they
// never supply the silhouette or stand in for the model on a transparent card.
export function createCrackerModel(kind, textures = {}) {
  const group = new THREE.Group(); group.name = `cracker-${kind}`;
  const geometries = new Set(), materials = new Set();
  const material = (color, options = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: .82, metalness: 0,
      transparent: false, opacity: 1, depthTest: true, depthWrite: true, toneMapped: false, ...options });
    materials.add(m); return m;
  };
  const add = (name, geometry, mat, y = 0) => {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, mat); mesh.name = name; mesh.position.y = y;
    group.add(mesh); return mesh;
  };
  const rim = (name, radius, tube, y, mat) => {
    const mesh = add(name, new THREE.TorusGeometry(radius, tube, 8, 48), mat, y);
    mesh.rotation.x = Math.PI / 2; return mesh;
  };
  const paper = material(0xd9b982, { roughness: .94 });
  const cord = material(0xb49b70, { roughness: .96 });
  const dark = material(0x30251b, { roughness: 1 });
  const body = material(0xffffff, { map: textures[kind] || null, emissive: 0xff8b23, emissiveIntensity: 0 });
  let height;
  if (kind === 'sutli') {
    height = .106;
    add('solid-jute-core', new THREE.SphereGeometry(.05, 32, 24), body, .053);
    // A raised spiral and crossing cords make the wrapping readable in profile.
    const points = [];
    for (let i = 0; i <= 180; i++) {
      const u = i / 180, latitude = .10 + u * (Math.PI - .20), angle = u * Math.PI * 24;
      points.push(new THREE.Vector3(.051 * Math.sin(latitude) * Math.cos(angle),
        .053 + .051 * Math.cos(latitude), .051 * Math.sin(latitude) * Math.sin(angle)));
    }
    add('raised-jute-spiral', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 240, .00135, 6, false), cord);
    for (let i = 0; i < 3; i++) {
      const loop = add('crossed-binding', new THREE.TorusGeometry(.0515, .0014, 6, 64), cord, .053);
      loop.rotation.set(Math.PI / 2, i * Math.PI / 3, .2);
    }
    add('fuse-knot', new THREE.SphereGeometry(.006, 12, 8), dark, .102);
  } else {
    const atom = kind === 'atom', radius = atom ? .044 : .017;
    height = atom ? .092 : .104;
    const profile = [[0, 0], [radius * .82, 0], [radius * .97, .003], [radius, .008],
      [radius, height - .009], [radius * .94, height - .003], [radius * .80, height], [0, height]];
    const bodyGeometry = new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 48);
    // LatheGeometry's default V follows profile indices, which stretches the
    // label over the bevels. Map by physical height for a clean paper wrapper.
    for (let i = 0; i < bodyGeometry.attributes.uv.count; i++) {
      bodyGeometry.attributes.uv.setY(i, bodyGeometry.attributes.position.getY(i) / height);
    }
    add('rounded-paper-body', bodyGeometry, body);
    add('pressed-bottom-cap', new THREE.CylinderGeometry(radius * .88, radius * .82, .003, 40), paper, .0015);
    add('pressed-top-cap', new THREE.CylinderGeometry(radius * .80, radius * .88, .003, 40), paper, height - .0007);
    const edge = material(atom ? 0x2c6a41 : 0xc0281f);
    rim('bottom-rolled-edge', radius * .95, .0018, .005, edge);
    rim('top-rolled-edge', radius * .93, .0018, height - .005, edge);
    if (atom) {
      const points = [];
      for (let i = 0; i <= 96; i++) {
        const u = i / 96, angle = u * Math.PI * 5;
        points.push(new THREE.Vector3((radius + .0015) * Math.cos(angle), .013 + u * (height - .026), (radius + .0015) * Math.sin(angle)));
      }
      add('raised-cotton-binding', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 120, .0011, 6, false), cord);
    } else {
      rim('upper-gold-band', radius + .0003, .0012, height * .68, paper);
      rim('lower-gold-band', radius + .0003, .0012, height * .35, paper);
    }
    add('fuse-entry', new THREE.CylinderGeometry(.0038, .0038, .0018, 16), dark, height + .0004);
  }
  const curve = new THREE.CubicBezierCurve3(new THREE.Vector3(0, height, 0),
    new THREE.Vector3(.001, height + .012, .001), new THREE.Vector3(.014, height + .022, -.002),
    new THREE.Vector3(.019, height + .032, -.003));
  const fuseGeometry = new THREE.TubeGeometry(curve, 36, .0016, 6, false);
  add('solid-curved-fuse', fuseGeometry, cord);
  const emberMaterial = material(0xffb04d, { emissive: 0xff7418, emissiveIntensity: 1.7, roughness: .5 });
  const ember = add('burning-fuse-tip', new THREE.SphereGeometry(.0024, 12, 8), emberMaterial);
  ember.position.copy(curve.getPoint(1));
  const fullCount = fuseGeometry.index.count;
  let disposed = false;
  return {
    group, height,
    burn(progress, flame = .08) {
      const remaining = Math.max(0, Math.min(1, 1 - progress));
      fuseGeometry.setDrawRange(0, Math.floor(fullCount * remaining / 36) * 36);
      ember.position.copy(curve.getPoint(remaining));
      body.emissiveIntensity = flame * .22;
      group.updateMatrixWorld(true);
      return group.localToWorld(ember.position.clone());
    },
    dispose() {
      if (disposed) return;
      disposed = true; group.removeFromParent();
      for (const geometry of geometries) geometry.dispose();
      for (const mat of materials) mat.dispose();
      // Supplied wrapping textures are shared and belong to the application.
    },
  };
}

export function addCrackerLights(scene) {
  const hemisphere = new THREE.HemisphereLight(0xfff1da, 0x373544, .8);
  const key = new THREE.DirectionalLight(0xffefda, 2.3); key.position.set(-3, 6, 2);
  const rim = new THREE.DirectionalLight(0xbbd3ff, .65); rim.position.set(3, 2, -4);
  scene.add(hemisphere, key, rim);
}
