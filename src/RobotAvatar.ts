/// <reference path="./types/globals.d.ts" />
import { RobotHand } from './RobotHand';
import { ASL_ALPHABET } from './ASLAlphabet';
import { englishToASLGloss } from './ASLGloss';

export class RobotAvatar {
    container: HTMLElement;
    scene!: THREE.Scene;
    camera!: THREE.PerspectiveCamera;
    renderer!: THREE.WebGLRenderer;
    clock: THREE.Clock;

    leftHand: RobotHand;
    rightHand: RobotHand;

    // Queue State
    animationQueue: string[] = [];
    isAnimating: boolean = false;
    currentAnimationEnd: number = 0;

    // Current sign display element
    signDisplay: HTMLElement | null = null;

    constructor(containerId: string) {
        const el = document.getElementById(containerId);
        if (!el) throw new Error(`Container ${containerId} not found`);
        this.container = el;
        this.clock = new THREE.Clock();

        // Get the sign display element
        this.signDisplay = document.getElementById('current-sign');

        this.initScene();

        // Create Hands (attached to scene)
        this.leftHand = new RobotHand('left', this.scene);
        this.rightHand = new RobotHand('right', this.scene);

        // Handle resize
        window.addEventListener('resize', () => this.onWindowResize(), false);
    }

    initScene() {
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x111827, 0.05);

        this.camera = new THREE.PerspectiveCamera(60, this.container.clientWidth / this.container.clientHeight, 0.1, 100);
        this.camera.position.set(0, 2, 15);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.shadowMap.enabled = true;
        this.container.appendChild(this.renderer.domElement);

        // Lighting
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        dirLight.position.set(5, 10, 7);
        dirLight.castShadow = true;
        this.scene.add(dirLight);

        const spotLight = new THREE.SpotLight(0x00aaff, 0.8);
        spotLight.position.set(-5, 5, 5);
        this.scene.add(spotLight);

        const ambient = new THREE.AmbientLight(0x404040);
        this.scene.add(ambient);

        // Background Color (Dark for hand visibility)
        this.renderer.setClearColor(0x0a0e17, 1);

        console.log("[RobotAvatar] Scene initialized.");
        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }

    // Show the current word being signed
    private showCurrentSign(text: string) {
        if (this.signDisplay) {
            this.signDisplay.textContent = text;
            this.signDisplay.style.opacity = '1';
        }
    }

    // Hide the current sign display
    private hideCurrentSign() {
        if (this.signDisplay) {
            this.signDisplay.style.opacity = '0';
        }
    }

    // Main entry point for sentences
    triggerAnimation(input: string) {
        console.log(`[Avatar] Processing: "${input}"`);

        // Convert English to ASL gloss (handles grammar, tense, articles, etc.)
        const glossWords = englishToASLGloss(input);
        console.log(`[Avatar] ASL Gloss: ${glossWords.join(' ')}`);

        // Queue EVERY word - RobotHand has category-based animations for all words
        for (const word of glossWords) {
            this.animationQueue.push(word);
        }

        console.log(`[Avatar] Queue length: ${this.animationQueue.length}`);
    }

    animate() {
        const time = this.clock.getElapsedTime();
        const now = Date.now();

        // Queue Processing - check if ready for next animation
        if (!this.isAnimating && this.animationQueue.length > 0) {
            const nextAnim = this.animationQueue.shift();
            if (nextAnim) {
                this.startAnimation(nextAnim);
            }
        }

        // Check if animation finished
        if (this.isAnimating && now > this.currentAnimationEnd) {
            this.isAnimating = false;
            // When queue is empty, return to idle
            if (this.animationQueue.length === 0) {
                this.hideCurrentSign();
                // Return hands to idle position
                this.leftHand.triggerAnimation('IDLE');
                this.rightHand.triggerAnimation('IDLE');
            }
        }

        this.leftHand.update(time);
        this.rightHand.update(time);

        this.renderer.render(this.scene, this.camera);
    }

    private startAnimation(type: string) {
        console.log(`[Avatar] Playing: ${type}`);
        this.isAnimating = true;

        // Natural pace animations
        let duration = 800; // Good readable pace for words
        let displayText = type;

        if (type.startsWith('CHAR_')) {
            // It's a letter - fingerspell
            const char = type.split('_')[1].toUpperCase();
            // @ts-ignore
            const pose = ASL_ALPHABET[char.toLowerCase()];

            if (pose) {
                this.rightHand.poseHand(pose);
                this.leftHand.triggerAnimation('IDLE');
                duration = 400; // Readable pace for letters
            }
            displayText = char; // Show just the letter
        } else {
            // It's a word animation
            this.leftHand.triggerAnimation(type);
            this.rightHand.triggerAnimation(type);
            duration = 800; // Almost a second per word
        }

        // Show the current sign
        this.showCurrentSign(displayText);

        this.currentAnimationEnd = Date.now() + duration;
    }
}
