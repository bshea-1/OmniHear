// Declare global variables for CDN libraries
declare const handpose: any;
declare const fp: any;

// Declare usage of THREE namespace for types to allow "THREE.Group" etc.
// We are using @types/three via devDependencies for intellisense, 
// but we need to tell TS that 'THREE' exists globally as a namespace.
// Using a simple 'any' fallback for the specific types used to avoid conflict hell with @types/three
declare namespace THREE {
    type Group = any;
    type Mesh = any;
    type Scene = any;
    type PerspectiveCamera = any;
    type WebGLRenderer = any;
    type Euler = any;
    type Clock = any;
    type Material = any;
    type Vector3 = any;
    type Object3D = any; // Added this

    // Allow accessing values on the namespace
    const Math: any;
    const Scene: any;
    const PerspectiveCamera: any;
    const WebGLRenderer: any;
    const DirectionalLight: any;
    const AmbientLight: any;
    const SpotLight: any;
    const MeshStandardMaterial: any;
    const BoxGeometry: any;
    const SphereGeometry: any;
    const CylinderGeometry: any;
    const Group: any;
    const Mesh: any;
    const Clock: any;
    const FogExp2: any;
    const Euler: any;
    const MeshBasicMaterial: any;
    const DoubleSide: any;
    const SphereGeometry: any;
    const PlaneGeometry: any;
}

// Window extensions
interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
}
