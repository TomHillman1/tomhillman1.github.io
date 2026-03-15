import * as THREE from 'three';

const loader = new THREE.TextureLoader();
loader.setCrossOrigin('anonymous');

export const loadTexture = (url: string) =>
  new Promise<THREE.Texture>((resolve, reject) => {
    loader.load(
      url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        resolve(texture);
      },
      undefined,
      (err) => reject(err)
    );
  });
