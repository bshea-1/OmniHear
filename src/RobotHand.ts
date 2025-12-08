/// <reference path="./types/globals.d.ts" />

type FingerName = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';

// Helper for Math
function lerp(start: number, end: number, amt: number) {
    return (1 - amt) * start + amt * end;
}

export class RobotHand {
    side: 'left' | 'right';
    wrist!: THREE.Group;
    fingers: { [key: string]: { root: THREE.Group, segments: THREE.Group[] } } = {};
    joints: THREE.Group[] = [];

    // Animation Intepolation State
    // We separate "Target" (Where we want to be) from "Current" (Where we are)
    // This allows smooth transitions regardless of how fast targets change.
    private targetState = {
        wristRot: new THREE.Euler(0, 0, 0),
        fingerCurls: {
            thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0
        }
    };

    private currentState = {
        wristRot: new THREE.Euler(0, 0, 0),
        fingerCurls: {
            thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0
        }
    };

    animState: string = "IDLE";
    animStartTime: number = 0;

    constructor(side: 'left' | 'right', parent: THREE.Object3D) {
        this.side = side;
        this.buildHand(parent);
    }

    buildHand(parent: THREE.Object3D) {
        console.log(`[RobotHand] Building ${this.side} hand...`);
        const material = new THREE.MeshStandardMaterial({
            color: 0xc0c0c0, roughness: 0.4, metalness: 0.8, side: THREE.DoubleSide
        });
        const jointMaterial = new THREE.MeshStandardMaterial({
            color: 0x333333, roughness: 0.7, metalness: 0.5
        });

        this.wrist = new THREE.Group();
        const xOffset = this.side === 'right' ? 1.5 : -1.5;
        this.wrist.position.set(xOffset, -2, 0);
        if (this.side === 'left') this.wrist.scale.x = -1; // Mirror



        parent.add(this.wrist);
        this.joints.push(this.wrist);

        // Palm
        const palm = new THREE.Mesh(new THREE.BoxGeometry(2.5, 3, 0.5), material);
        palm.position.y = 1.5;
        // palm.castShadow = true; 
        this.wrist.add(palm);

        // Fingers Config
        const fingerConfig: { name: FingerName, x: number, y: number, z: number, rotZ: number, scale: number }[] = [
            { name: 'thumb', x: 1.5, y: 0.5, z: 0, rotZ: -0.5, scale: 1.2 },
            { name: 'index', x: 1.0, y: 3, z: 0, rotZ: 0, scale: 1.0 },
            { name: 'middle', x: 0.3, y: 3.2, z: 0, rotZ: 0, scale: 1.05 },
            { name: 'ring', x: -0.4, y: 3, z: 0, rotZ: 0, scale: 1.0 },
            { name: 'pinky', x: -1.1, y: 2.8, z: 0, rotZ: 0, scale: 0.9 }
        ];

        fingerConfig.forEach(conf => {
            const root = new THREE.Group();
            root.position.set(conf.x, conf.y, conf.z);
            root.rotation.z = conf.rotZ;
            this.wrist.add(root);

            const segs: THREE.Group[] = [];
            let parentBone = root;

            // 3 Segments usually
            const lengths = [0.8, 0.7, 0.6];
            lengths.forEach((len, i) => {
                const s = this.createSegment(len * conf.scale, material, jointMaterial);

                // Attach to previous bone tip.
                // Previous bone center is at L/2. Tip is at L/2 relative to center.
                if (i > 0) {
                    s.joint.position.y = (lengths[i - 1] * conf.scale) / 2;
                }

                parentBone.add(s.joint);
                parentBone = s.bone;
                segs.push(s.joint);
                this.joints.push(s.joint);
            });

            this.fingers[conf.name] = { root, segments: segs };
        });
    }

    createSegment(length: number, mat: THREE.Material, jointMat: THREE.Material) {
        const joint = new THREE.Group();
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 16), jointMat);
        joint.add(sphere);

        const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, length, 16), mat);
        // Bone center is shifted so joint is at bottom
        bone.position.y = length / 2;
        // bone.castShadow = true;
        joint.add(bone);

        return { joint, bone };
    }

    // --- Core Logic ---

    // Set Targets (Logic Layer)
    setFace(finger: FingerName, curl: number) {
        this.targetState.fingerCurls[finger] = curl;
    }

    setWrist(x: number, y: number, z: number) {
        this.targetState.wristRot.x = x;
        this.targetState.wristRot.y = y;
        this.targetState.wristRot.z = z;
    }

    poseHand(pose: { thumb: number, index: number, middle: number, ring: number, pinky: number }) {
        this.animState = 'POSE';
        this.setFace('thumb', pose.thumb);
        this.setFace('index', pose.index);
        this.setFace('middle', pose.middle);
        this.setFace('ring', pose.ring);
        this.setFace('pinky', pose.pinky);
        this.setWrist(-0.2, 0, 0);
    }

    triggerAnimation(type: string) {
        this.animState = type;
        this.animStartTime = Date.now();
    }

    update(time: number) {
        this.updateLogic(time);
        this.updateLerp();

        // Debug NaN
        const r = this.currentState.wristRot;
        if (isNaN(r.x) || isNaN(r.y) || isNaN(r.z)) {
            console.error(`[RobotHand] NaN Detected! Side: ${this.side}`, r);
            // Reset to 0
            this.currentState.wristRot.set(0, 0, 0);
        }

        this.applyToMesh();
    }

    updateLogic(time: number) {
        const state = this.animState;

        // Helper for common hand poses
        const flatHand = () => ['thumb', 'index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0));
        const fist = () => ['thumb', 'index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
        const pointIndex = () => {
            this.setFace('index', 0);
            ['thumb', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
        };
        const thumbsUp = () => {
            this.setFace('thumb', 0);
            ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
        };

        // Default idle with gentle sway
        if (state === 'IDLE' || state === 'POSE') {
            const sway = Math.sin(time * 1.5) * 0.05;
            this.setWrist(sway * 0.5, 0, sway);
            ['thumb', 'index', 'middle', 'ring', 'pinky'].forEach(f =>
                this.setFace(f as FingerName, 0.1 + Math.sin(time + (f === 'thumb' ? 0 : 2)) * 0.05)
            );
            return;
        }

        // === GREETINGS & BASICS - ACCURATE ASL ===
        switch (state) {
            case 'HELLO':
                // B-hand near forehead, move outward like salute
                const helloMove = Math.sin(time * 5) * 0.4;
                this.setWrist(-0.3 + helloMove, 0, helloMove * 0.3);
                flatHand(); // B handshape
                break;
            case 'GOODBYE':
                // Open hand wave
                const byeWave = Math.sin(time * 8) * 0.5;
                this.setWrist(0, 0, byeWave);
                flatHand();
                break;
            case 'YES':
                // S-hand (fist) nodding up and down
                const yesNod = Math.sin(time * 6) * 0.4;
                this.setWrist(yesNod, 0, 0);
                fist(); // S handshape
                break;
            case 'NO':
                // Index+middle+thumb snap together
                const noSnap = Math.abs(Math.sin(time * 8));
                this.setWrist(0, 0, noSnap * 0.2);
                this.setFace('thumb', noSnap * 0.5);
                this.setFace('index', noSnap * 0.5);
                this.setFace('middle', noSnap * 0.5);
                this.setFace('ring', 1.5);
                this.setFace('pinky', 1.5);
                break;
            case 'THANK':
                // Flat hand from chin moving forward and down
                const thankMove = Math.sin(time * 4) * 0.5;
                this.setWrist(thankMove - 0.2, 0, 0);
                flatHand(); // Flat B hand
                break;
            case 'PLEASE':
                // Flat hand circular motion on chest
                const pleaseCircleX = Math.sin(time * 4) * 0.3;
                const pleaseCircleY = Math.cos(time * 4) * 0.3;
                this.setWrist(pleaseCircleX, pleaseCircleY, 0);
                flatHand();
                break;
            case 'SORRY':
                // A-hand (fist with thumb out) circular on chest
                const sorryCircle = Math.sin(time * 3) * 0.3;
                const sorryCircle2 = Math.cos(time * 3) * 0.2;
                this.setWrist(sorryCircle, sorryCircle2, 0);
                // A handshape - fist with thumb alongside
                fist();
                break;

            // === PRONOUNS ===
            case 'I':
            case 'ME':
                this.setWrist(0.3, 0, 0);
                pointIndex();
                break;
            case 'YOU':
                this.setWrist(-0.2, 0, 0);
                pointIndex();
                break;
            case 'MY':
                this.setWrist(0.5, 0, 0);
                flatHand();
                break;
            case 'HE':
            case 'SHE':
            case 'IT':
                this.setWrist(0, 0.3, 0);
                pointIndex();
                break;
            case 'WE':
                const weMotion = Math.sin(time * 3) * 0.3;
                this.setWrist(0, weMotion, 0);
                pointIndex();
                break;
            case 'THEY':
                const theyMotion = Math.sin(time * 3) * 0.4;
                this.setWrist(0, theyMotion, 0);
                pointIndex();
                break;

            // === QUESTIONS ===
            case 'WHAT':
                const whatShake = Math.sin(time * 6) * 0.3;
                this.setWrist(0, whatShake, 0);
                flatHand();
                break;
            case 'WHERE':
                const whereShake = Math.sin(time * 5) * 0.4;
                this.setWrist(0, 0, whereShake);
                pointIndex();
                break;
            case 'WHEN':
                const whenCircle = Math.sin(time * 4);
                this.setWrist(0, whenCircle * 0.2, 0);
                pointIndex();
                break;
            case 'WHO':
                const whoCircle = Math.sin(time * 5);
                this.setWrist(0, 0, whoCircle * 0.2);
                this.setFace('thumb', 0.5);
                this.setFace('index', 0.5);
                ['middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'WHY':
                const whyMotion = Math.sin(time * 4) * 0.3;
                this.setWrist(whyMotion, 0, 0);
                this.setFace('middle', 0);
                ['thumb', 'index', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'HOW':
                const howRotate = Math.sin(time * 5) * 0.4;
                this.setWrist(howRotate, 0, 0);
                fist();
                break;

            // === VERBS ===
            case 'GO':
                const goMotion = Math.sin(time * 6) * 0.5;
                this.setWrist(0, 0, goMotion);
                pointIndex();
                break;
            case 'COME':
                const comeMotion = Math.sin(time * 6) * 0.5;
                this.setWrist(comeMotion, 0, 0);
                pointIndex();
                break;
            case 'EAT':
                const eatMotion = Math.abs(Math.sin(time * 5));
                this.setWrist(eatMotion * 0.3, 0, 0);
                this.setFace('thumb', 0.5);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.2));
                break;
            case 'DRINK':
                const drinkTilt = Math.sin(time * 3) * 0.3;
                this.setWrist(drinkTilt - 0.2, 0, 0);
                this.setFace('thumb', 0.8);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0.8));
                break;
            case 'SLEEP':
                this.setWrist(0.3, 0, 0);
                flatHand();
                break;
            case 'WORK':
                const workTap = Math.abs(Math.sin(time * 8));
                this.setWrist(0, 0, workTap * 0.3);
                fist();
                break;
            case 'PLAY':
                const playShake = Math.sin(time * 8) * 0.4;
                this.setWrist(0, 0, playShake);
                this.setFace('thumb', 0);
                this.setFace('pinky', 0);
                ['index', 'middle', 'ring'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'LEARN':
                const learnMotion = Math.sin(time * 4);
                this.setWrist(learnMotion * 0.3, 0, 0);
                flatHand();
                break;
            case 'KNOW':
                const knowTap = Math.abs(Math.sin(time * 6));
                this.setWrist(knowTap * 0.2, 0, 0);
                flatHand();
                break;
            case 'THINK':
                const thinkCircle = Math.sin(time * 3);
                this.setWrist(thinkCircle * 0.1, 0, 0);
                pointIndex();
                break;
            case 'SEE':
                const seeMotion = Math.sin(time * 5) * 0.3;
                this.setWrist(0, 0, seeMotion);
                this.setFace('index', 0);
                this.setFace('middle', 0);
                ['thumb', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'HEAR':
                const hearPoint = Math.abs(Math.sin(time * 4));
                this.setWrist(hearPoint * 0.2, 0, 0);
                pointIndex();
                break;
            case 'FEEL':
                const feelRub = Math.sin(time * 3);
                this.setWrist(feelRub * 0.2, 0, 0);
                this.setFace('middle', 0);
                ['thumb', 'index', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'UNDERSTAND':
                const understandFlick = Math.abs(Math.sin(time * 6));
                this.setWrist(0, 0, understandFlick * 0.3);
                pointIndex();
                break;
            case 'REMEMBER':
                const rememberTap = Math.abs(Math.sin(time * 5));
                this.setWrist(rememberTap * 0.2, 0, 0);
                thumbsUp();
                break;
            case 'FORGET':
                const forgetWipe = Math.sin(time * 4);
                this.setWrist(0, forgetWipe * 0.3, 0);
                flatHand();
                break;

            // === EMOTIONS ===
            case 'HAPPY':
                const happyBounce = Math.abs(Math.sin(time * 6)) * 0.3;
                this.setWrist(happyBounce, 0, 0);
                flatHand();
                break;
            case 'SAD':
                this.setWrist(-0.3, 0, 0);
                flatHand();
                break;
            case 'HUNGRY':
                const hungryRub = Math.sin(time * 4);
                this.setWrist(hungryRub * 0.3, 0, 0);
                this.setFace('thumb', 0.5);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0.8));
                break;
            case 'THIRSTY':
                const thirstyDrag = Math.sin(time * 3);
                this.setWrist(thirstyDrag * 0.2, 0, 0);
                pointIndex();
                break;
            case 'GOOD':
                const goodMotion = Math.sin(time * 4) * 0.3;
                this.setWrist(0, 0, goodMotion);
                flatHand();
                break;
            case 'BAD':
                const badMotion = Math.sin(time * 5) * 0.3;
                this.setWrist(0, 0, badMotion);
                flatHand();
                break;

            // === WANT/NEED/LIKE - ACCURATE ASL ===
            case 'WANT':
                // Bent-5 hands (claws) pulling toward body
                const wantPull = Math.sin(time * 4) * 0.4;
                this.setWrist(wantPull, 0, 0);
                // Claw/bent-5 handshape
                this.setFace('thumb', 0.6);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0.6));
                break;
            case 'NEED':
                // X-hand (bent index) bending down twice
                const needBend = Math.abs(Math.sin(time * 6)) * 0.5;
                this.setWrist(needBend, 0, 0);
                // X handshape - bent index
                this.setFace('index', 0.8);
                ['thumb', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'LIKE':
                // Thumb+middle pull from chest outward
                const likePull = Math.sin(time * 4) * 0.3;
                this.setWrist(likePull, 0, 0);
                this.setFace('thumb', 0.3);
                this.setFace('middle', 0.3);
                ['index', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'LOVE':
                // Crossed fists on chest (hugging self)
                const loveHug = Math.sin(time * 2) * 0.2;
                this.setWrist(0.3 + loveHug, 0, 0);
                fist(); // S handshape crossed on chest
                break;
            case 'HELP':
                // Thumbs-up on flat hand, moving upward
                const helpLift = Math.sin(time * 4) * 0.4;
                this.setWrist(helpLift, 0, 0);
                thumbsUp(); // A-hand (thumbs up) on flat hand
                thumbsUp();
                break;

            // === FAMILY ===
            case 'MOTHER':
            case 'MOM':
                // Open-5 hand taps chin twice
                const motherTap = Math.abs(Math.sin(time * 6)) * 0.3;
                this.setWrist(motherTap, 0, 0);
                this.setFace('thumb', 0);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0));
                break;
            case 'FATHER':
            case 'DAD':
                // Open-5 hand taps forehead twice
                const dadTap = Math.abs(Math.sin(time * 6)) * 0.3;
                this.setWrist(dadTap + 0.3, 0, 0);
                this.setFace('thumb', 0);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0));
                break;
            case 'SISTER':
                // A-hand traces jaw then drops
                const sisTap = Math.sin(time * 4) * 0.3;
                this.setWrist(sisTap, 0, 0);
                fist();
                break;
            case 'BROTHER':
                // L-hand from forehead drops down
                const broTap = Math.sin(time * 4) * 0.4;
                this.setWrist(broTap + 0.2, 0, 0);
                this.setFace('thumb', 0);
                this.setFace('index', 0);
                ['middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'FAMILY':
                // F-hands circle outward (forming family circle)
                const famCircleX = Math.sin(time * 3) * 0.4;
                const famCircleY = Math.cos(time * 3) * 0.3;
                this.setWrist(famCircleX, famCircleY, 0);
                // F handshape
                this.setFace('thumb', 0.5);
                this.setFace('index', 0.5);
                ['middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0));
                break;
            case 'FRIEND':
                // Interlocking X-hands (hooked index fingers)
                const friendHook = Math.sin(time * 4) * 0.4;
                this.setWrist(0, friendHook, 0);
                // X handshape - bent index
                this.setFace('index', 0.7);
                ['thumb', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'BABY':
                // Rocking baby motion
                const babyRock = Math.sin(time * 3) * 0.4;
                this.setWrist(0, babyRock, 0);
                flatHand();
                break;
            case 'CHILD':
            case 'KIDS':
                // Patting child's head height
                const childPat = Math.abs(Math.sin(time * 5)) * 0.3;
                this.setWrist(0, 0, childPat);
                flatHand();
                break;
            case 'PERSON':
                // P-hands moving down (outlining person)
                const personDown = Math.sin(time * 3) * 0.3;
                this.setWrist(personDown, 0, 0);
                // P handshape
                this.setFace('thumb', 0.5);
                this.setFace('index', 0.3);
                this.setFace('middle', 0);
                ['ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'PEOPLE':
                // P-hands alternating (multiple people)
                const peopleAlt = Math.sin(time * 5) * 0.4;
                this.setWrist(0, peopleAlt, 0);
                // P handshape
                this.setFace('thumb', 0.5);
                this.setFace('index', 0.3);
                this.setFace('middle', 0);
                ['ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;

            // === PLACES ===
            case 'HOUSE':
            case 'SCHOOL':
            // Removed redundant generic places


            // Removed redundant generic time


            // === MODIFIERS ===
            case 'BIG':
                const bigSpread = Math.sin(time * 3) * 0.3;
                this.setWrist(0, 0, bigSpread);
                flatHand();
                break;
            case 'SMALL':
                const smallClose = Math.sin(time * 5) * 0.2;
                this.setWrist(0, 0, smallClose);
                this.setFace('thumb', 0.5);
                this.setFace('index', 0.5);
                ['middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'MORE':
                const moreMotion = Math.sin(time * 5);
                this.setWrist(moreMotion * 0.3, 0, 0);
                this.setFace('thumb', 0.5);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0.5));
                break;
            case 'DONE':
            case 'FINISH':
                const doneShake = Math.sin(time * 8) * 0.4;
                this.setWrist(0, 0, doneShake);
                flatHand();
                break;
            case 'NOT':
                const notFlick = Math.sin(time * 6);
                this.setWrist(0, 0, notFlick * 0.4);
                thumbsUp();
                break;
            case 'AGAIN':
                const againBounce = Math.sin(time * 6);
                this.setWrist(againBounce * 0.3, 0, 0);
                flatHand();
                break;
            case 'ALWAYS':
            case 'NEVER':
            case 'SOMETIMES':
                const freqMotion = Math.sin(time * 4) * 0.3;
                this.setWrist(0, freqMotion, 0);
                pointIndex();
                break;

            // === DIRECTIONS ===
            case 'HERE':
            case 'THERE':
            case 'UP':
            case 'DOWN':
            case 'IN':
            case 'OUT':
                const dirMotion = Math.sin(time * 5) * 0.3;
                this.setWrist(0, 0, dirMotion);
                pointIndex();
                break;

            // === MODALS ===
            case 'CAN':
            case 'WILL':
            case 'MUST':
            case 'SHOULD':
                const modalMotion = Math.sin(time * 6) * 0.3;
                this.setWrist(modalMotion, 0, 0);
                fist();
                break;

            // === CONJUNCTIONS ===
            case 'AND':
            case 'BUT':
            case 'OR':
            case 'IF':
            case 'BECAUSE':
                const conjMotion = Math.sin(time * 4) * 0.2;
                this.setWrist(0, conjMotion, 0);
                flatHand();
                break;

            // === NAME ===
            case 'NAME':
                const nameTap = Math.abs(Math.sin(time * 10));
                this.setWrist(0, 0, nameTap * 0.3);
                this.setFace('index', 0);
                this.setFace('middle', 0);
                ['thumb', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;

            // === SPECIFIC WORD ANIMATIONS ===
            // Places - each unique
            case 'PARK':
                // Open hands spreading outward (trees/nature)
                const parkSpread = Math.sin(time * 4) * 0.5;
                this.setWrist(0, parkSpread, 0);
                flatHand();
                break;
            case 'HOUSE':
            case 'HOME':
                // Roof shape - hands form triangle
                const houseAngle = Math.sin(time * 3) * 0.2;
                this.setWrist(0.4 + houseAngle, 0, 0.3);
                flatHand();
                break;
            case 'SCHOOL':
                // Clapping motion (teacher clapping for attention)
                const schoolClap = Math.abs(Math.sin(time * 8));
                this.setWrist(schoolClap * 0.4, 0, 0);
                flatHand();
                break;
            case 'STORE':
            case 'SHOP':
                // Money/shopping gesture
                const storeRub = Math.sin(time * 6) * 0.4;
                this.setWrist(storeRub, 0, 0);
                this.setFace('thumb', 0.5);
                this.setFace('index', 0.5);
                ['middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'HOSPITAL':
                // Cross shape on arm
                const hospCross = Math.sin(time * 4) * 0.3;
                this.setWrist(hospCross, 0, hospCross);
                this.setFace('index', 0);
                this.setFace('middle', 0);
                ['thumb', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'CHURCH':
                // Steeple shape
                const churchPoint = Math.sin(time * 2) * 0.2;
                this.setWrist(0.5 + churchPoint, 0, 0);
                pointIndex();
                break;
            case 'BEACH':
                // Wave motion
                const beachWave = Math.sin(time * 3) * 0.5;
                this.setWrist(beachWave, 0, beachWave * 0.5);
                flatHand();
                break;

            case 'COFFEE':
                // Grinding coffee
                const coffeeGrind = Math.sin(time * 5) * 0.4;
                this.setWrist(0, coffeeGrind, 0);
                fist();
                break;
            case 'MILK':
                // Milking gesture
                const milkSqueeze = Math.abs(Math.sin(time * 6));
                this.setWrist(0, 0, milkSqueeze * 0.3);
                this.setFace('thumb', 0.5 + milkSqueeze * 0.3);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0.5 + milkSqueeze * 0.3));
                break;
            case 'PIZZA':
                // Z shape
                const pizzaZ = Math.sin(time * 8) * 0.4;
                this.setWrist(0, pizzaZ, pizzaZ);
                pointIndex();
                break;
            case 'COOKIE':
                // Cookie cutter motion
                const cookieCut = Math.sin(time * 5) * 0.4;
                this.setWrist(0, 0, cookieCut);
                this.setFace('thumb', 0.8);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0.8));
                break;

            // Objects - each unique
            case 'CAR':
                // Steering wheel
                const carSteer = Math.sin(time * 4) * 0.5;
                this.setWrist(0, carSteer, 0);
                fist();
                break;
            case 'PHONE':
            case 'TELEPHONE':
                // Phone to ear (Y handshape)
                const phoneHold = Math.sin(time * 3) * 0.2;
                this.setWrist(phoneHold + 0.3, 0, 0);
                this.setFace('thumb', 0);
                this.setFace('pinky', 0);
                ['index', 'middle', 'ring'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'COMPUTER':
                // Typing motion
                const compType = Math.abs(Math.sin(time * 10));
                this.setWrist(0, 0, compType * 0.3);
                this.setFace('index', 0.2 + compType * 0.3);
                this.setFace('middle', 0.2 + compType * 0.3);
                ['thumb', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.2));
                break;
            case 'BOOK':
                // Opening book
                const bookOpen = Math.sin(time * 4) * 0.5;
                this.setWrist(0, bookOpen, 0);
                flatHand();
                break;
            case 'DOOR':
                // Door opening
                const doorSwing = Math.sin(time * 3) * 0.6;
                this.setWrist(0, doorSwing, 0);
                flatHand();
                break;
            case 'CHAIR':
                // Sitting gesture (two fingers)
                const chairSit = Math.sin(time * 4) * 0.3;
                this.setWrist(chairSit, 0, 0);
                this.setFace('index', 0.5);
                this.setFace('middle', 0.5);
                ['thumb', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'TABLE':
                // Flat surface
                const tableSurface = Math.sin(time * 3) * 0.3;
                this.setWrist(tableSurface, 0, 0);
                flatHand();
                break;
            case 'BED':
                // Sleeping gesture
                const bedSleep = Math.sin(time * 2) * 0.3;
                this.setWrist(bedSleep + 0.3, 0, 0);
                flatHand();
                break;
            case 'MONEY':
                // Rubbing fingers together
                const moneyRub = Math.sin(time * 8) * 0.3;
                this.setWrist(moneyRub, 0, 0);
                this.setFace('thumb', 0.3);
                this.setFace('index', 0.3);
                this.setFace('middle', 0.3);
                ['ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'BOWL':
                // Cupped hands shape
                const bowlCurve = Math.sin(time * 3) * 0.2;
                this.setWrist(bowlCurve, 0, 0.3);
                this.setFace('thumb', 0.5);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0.6));
                break;



            // === ACTION VERBS - UNIQUE ANIMATIONS ===
            case 'RUN':
                const runMotion = Math.sin(time * 10) * 0.6;
                this.setWrist(runMotion * 0.3, 0, runMotion);
                pointIndex();
                break;
            case 'WALK':
                const walkStep = Math.sin(time * 6) * 0.4;
                this.setWrist(walkStep * 0.3, 0, walkStep);
                flatHand();
                break;
            case 'JUMP':
                const jumpUp = Math.abs(Math.sin(time * 6)) * 0.6;
                this.setWrist(jumpUp * 0.5, 0, 0);
                flatHand();
                break;
            case 'SWIM':
                const swimStroke = Math.sin(time * 4) * 0.6;
                this.setWrist(swimStroke, 0, 0);
                flatHand();
                break;
            case 'FLY':
                const flyFlap = Math.sin(time * 5) * 0.5;
                this.setWrist(flyFlap, 0, flyFlap * 0.3);
                flatHand();
                break;
            case 'DANCE':
                const danceMove = Math.sin(time * 7) * 0.5;
                this.setWrist(danceMove, danceMove * 0.5, 0);
                this.setFace('index', 0.5);
                this.setFace('middle', 0.5);
                break;
            case 'PUSH':
                const pushOut = Math.sin(time * 5) * 0.5;
                this.setWrist(0, 0, pushOut);
                flatHand();
                break;
            case 'PULL':
                const pullIn = Math.sin(time * 5) * -0.5;
                this.setWrist(0, 0, pullIn);
                fist();
                break;
            case 'THROW':
                const throwOut = Math.sin(time * 8) * 0.6;
                this.setWrist(0, throwOut * 0.5, throwOut);
                flatHand();
                break;
            case 'CATCH':
                const catchIn = Math.abs(Math.sin(time * 6)) * 0.5;
                this.setWrist(0, 0, catchIn);
                fist();
                break;
            case 'HIT':
                const hitStrike = Math.abs(Math.sin(time * 10)) * 0.6;
                this.setWrist(hitStrike, 0, hitStrike);
                fist();
                break;
            case 'KICK':
                const kickLeg = Math.sin(time * 7) * 0.5;
                this.setWrist(kickLeg, 0, 0);
                flatHand();
                break;
            case 'CLIMB':
                const climbUp = Math.sin(time * 5) * 0.5;
                this.setWrist(0, climbUp, 0);
                fist(); // mimic climbing ladder
                break;
            case 'FALL':
                const fallDown = Math.sin(time * 6) * -0.5;
                this.setWrist(0, fallDown, 0);
                flatHand();
                break;
            case 'CARRY':
                const carryHold = Math.sin(time * 4) * 0.3;
                this.setWrist(carryHold, 0, 0);
                flatHand(); // palms up
                break;
            case 'LIFT':
                const liftUp = Math.sin(time * 4) * 0.5;
                this.setWrist(0, liftUp, 0);
                flatHand();
                break;
            case 'DROP':
                const dropDown = Math.sin(time * 8) * -0.6;
                this.setWrist(0, dropDown, 0);
                flatHand();
                break;
            case 'MOVE':
                const moveSide = Math.sin(time * 4) * 0.4;
                this.setWrist(moveSide, 0, 0);
                flatHand();
                break;
            case 'TURN':
                const turnRot = Math.sin(time * 3) * 0.5;
                this.setWrist(turnRot, turnRot * 0.5, 0);
                pointIndex();
                break;
            case 'SPIN':
                const spinRot = Math.sin(time * 8);
                this.setWrist(0, spinRot * 0.5, 0);
                pointIndex();
                break;
            case 'ROLL':
                const rollRot = Math.sin(time * 5);
                this.setWrist(rollRot * 0.3, rollRot * 0.3, 0);
                fist();
                break;
            case 'SLIDE':
                const slideSmooth = Math.sin(time * 3) * 0.6;
                this.setWrist(slideSmooth, 0, 0);
                flatHand();
                break;
            case 'SHAKE':
                const shakeVigorous = Math.sin(time * 12) * 0.3;
                this.setWrist(shakeVigorous, 0, 0);
                fist();
                break;
            case 'WAVE':
                const waveHand = Math.sin(time * 6) * 0.5;
                this.setWrist(waveHand, 0, 0);
                flatHand();
                break;
            case 'POINT':
                const pointDir = Math.sin(time * 4) * 0.4;
                this.setWrist(0, 0, pointDir);
                pointIndex();
                break;
            case 'GRAB':
                const grabClose = Math.abs(Math.sin(time * 5));
                this.setWrist(0, 0, grabClose * 0.2);
                fist();
                break;
            case 'HOLD':
                this.setWrist(0, 0.2, 0);
                fist();
                break;
            case 'RELEASE':
                const releaseOpen = Math.sin(time * 5);
                this.setWrist(0, 0, releaseOpen * 0.2);
                flatHand();
                break;
            case 'BREAK':
                const breakSnap = Math.sin(time * 8) * 0.4;
                this.setWrist(breakSnap, 0, 0);
                fist();
                break;
            case 'FIX':
                const fixTap = Math.abs(Math.sin(time * 8)) * 0.3;
                this.setWrist(fixTap, 0, 0);
                this.setFace('index', 0.5);
                this.setFace('middle', 0.5);
                break;
            case 'BUILD':
                const buildStack = Math.sin(time * 5) * 0.4;
                this.setWrist(0, buildStack, 0);
                flatHand();
                break;
            case 'CREATE':
                const createFlow = Math.sin(time * 3) * 0.4;
                this.setWrist(createFlow, createFlow * 0.2, 0);
                this.setFace('index', 0.3); // 4-hand
                this.setFace('middle', 0.3);
                this.setFace('ring', 0.3);
                this.setFace('pinky', 0.3);
                break;
            case 'DESTROY':
                const destroyCrush = Math.sin(time * 5) * 0.5;
                this.setWrist(0, 0, destroyCrush);
                fist();
                break;
            case 'OPEN':
                const openHands = Math.sin(time * 4) * 0.6;
                this.setWrist(openHands, 0, 0);
                flatHand();
                break;
            case 'CLOSE':
                const closeHands = Math.sin(time * 4) * -0.6;
                this.setWrist(closeHands, 0, 0);
                flatHand();
                break;
            case 'CUT':
                const cutScissor = Math.sin(time * 8) * 0.3;
                this.setWrist(0, cutScissor, 0);
                this.setFace('index', 0);
                this.setFace('middle', 0);
                ['ring', 'pinky', 'thumb'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'POUR':
                const pourTilt = Math.sin(time * 4) * 0.5;
                this.setWrist(pourTilt, 0, 0);
                this.setFace('thumb', 0.5); // C-hand
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0.5));
                break;
            case 'MIX':
                const mixCircle = Math.sin(time * 6) * 0.3;
                this.setWrist(mixCircle, mixCircle, 0);
                this.setFace('thumb', 0.5); // C-hand 
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0.5));
                break;
            case 'STIR':
                const stirCircle = Math.sin(time * 7) * 0.2;
                this.setWrist(stirCircle, stirCircle, 0);
                // A-hand (spoon)
                fist();
                break;
            case 'COOK':
                const cookFlip = Math.sin(time * 5) * 0.4;
                this.setWrist(0, cookFlip, 0);
                flatHand();
                break;
            case 'BAKE':
                const bakeSlide = Math.sin(time * 3) * 0.5;
                this.setWrist(0, 0, bakeSlide);
                flatHand();
                break;
            case 'FRY':
                const frySizzle = Math.sin(time * 10) * 0.1;
                this.setWrist(frySizzle, 0, 0);
                flatHand();
                break;
            case 'BOIL':
                const boilBubble = Math.sin(time * 8) * 0.2;
                this.setWrist(0, boilBubble, 0);
                this.setFace('thumb', 0.5); // Wiggle fingers
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0.2 + Math.sin(time * 10) * 0.1));
                break;
            case 'WASH':
                const washRub = Math.sin(time * 6) * 0.3;
                this.setWrist(0, 0, washRub);
                fist(); // A-hands rubbing
                break;
            case 'CLEAN':
                const cleanWipe = Math.sin(time * 4) * 0.6;
                this.setWrist(cleanWipe, 0, 0);
                flatHand();
                break;
            case 'WIPE':
                const wipeSide = Math.sin(time * 5) * 0.5;
                this.setWrist(wipeSide, 0, 0);
                flatHand();
                break;
            case 'SCRUB':
                const scrubHard = Math.sin(time * 8) * 0.3;
                this.setWrist(scrubHard, scrubHard, 0);
                fist();
                break;
            case 'FOLD':
                const foldOver = Math.sin(time * 3) * 0.4;
                this.setWrist(foldOver, 0, 0);
                flatHand();
                break;
            case 'HANG':
                const hangHook = Math.sin(time * 4) * 0.2;
                this.setWrist(0, hangHook, 0);
                this.setFace('index', 0.8); // X-hand hook
                ['thumb', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'PACK':
                const packStuff = Math.sin(time * 5) * 0.3;
                this.setWrist(0, 0, packStuff);
                flatHand(); // O-hands grabbing
                this.setFace('thumb', 1.0);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.0));
                break;
            case 'UNPACK':
                const unpackOut = Math.sin(time * 5) * -0.3;
                this.setWrist(0, 0, unpackOut);
                flatHand();
                break;
            case 'WRAP':
                const wrapAround = Math.sin(time * 4) * 0.3;
                this.setWrist(wrapAround, 0, 0);
                flatHand();
                break;
            case 'UNWRAP':
                const unwrapOpen = Math.sin(time * 4) * -0.3;
                this.setWrist(unwrapOpen, 0, 0);
                flatHand();
                break;
            case 'TIE':
                const tieKnot = Math.sin(time * 5) * 0.2;
                this.setWrist(tieKnot, 0, 0);
                this.setFace('thumb', 0.5); // T-hands twisting
                this.setFace('index', 1.5);
                ['middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'UNTIE':
                const untiePull = Math.sin(time * 5) * -0.2;
                this.setWrist(untiePull, 0, 0);
                this.setFace('thumb', 0.5);
                this.setFace('index', 1.5);
                ['middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;

            // === COMMUNICATION VERBS ===
            case 'TALK':
                const talkTap = Math.abs(Math.sin(time * 8)) * 0.2;
                this.setWrist(talkTap, 0, 0);
                pointIndex(); // 4-hand tapping chin
                this.setFace('middle', 0);
                this.setFace('ring', 0);
                this.setFace('pinky', 0);
                break;
            case 'SPEAK':
                const speakOut = Math.sin(time * 5) * 0.3;
                this.setWrist(speakOut, 0, 0);
                flatHand();
                break;
            case 'SAY':
                const sayChin = Math.sin(time * 4) * 0.2;
                this.setWrist(sayChin, 0, 0);
                pointIndex();
                break;
            case 'TELL':
                const tellOut = Math.sin(time * 4) * 0.4;
                this.setWrist(0, 0, tellOut);
                pointIndex();
                break;
            case 'ASK':
                const askPray = Math.sin(time * 3) * 0.3;
                this.setWrist(0, askPray, 0); // Prayer hands tilting match
                flatHand();
                break;
            case 'ANSWER':
                const answerOut = Math.sin(time * 4) * 0.4;
                this.setWrist(answerOut, 0, 0);
                pointIndex(); // R-hand moving out
                break;
            case 'CALL':
                const callPhone = Math.sin(time * 3) * 0.2;
                this.setWrist(callPhone + 0.3, 0, 0);
                this.setFace('thumb', 0); // Y-hand
                this.setFace('pinky', 0);
                ['index', 'middle', 'ring'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'SHOUT':
                const shoutWide = Math.sin(time * 5) * 0.5;
                this.setWrist(shoutWide, 0, shoutWide * 0.5);
                this.setFace('thumb', 0.5); // C-hands at mouth
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0.5));
                break;
            case 'WHISPER':
                const whisperCover = Math.sin(time * 2) * 0.1;
                this.setWrist(whisperCover + 0.2, 0, 0.3);
                flatHand();
                break;
            case 'SING':
                const singFlow = Math.sin(time * 4) * 0.4;
                this.setWrist(singFlow, 0, 0); // Arm waving conductor
                flatHand();
                break;
            case 'READ':
                const readScan = Math.sin(time * 5) * 0.3;
                this.setWrist(0, readScan, 0); // V-eyes scanning palm
                this.setFace('index', 0);
                this.setFace('middle', 0);
                ['thumb', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'WRITE':
                const writeScribble = Math.sin(time * 10) * 0.1;
                this.setWrist(writeScribble, writeScribble, 0);
                this.setFace('thumb', 0); // Holding pen
                this.setFace('index', 0);
                ['middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'DRAW':
                const drawLine = Math.sin(time * 4) * 0.3;
                this.setWrist(drawLine, drawLine, 0);
                this.setFace('pinky', 0); // I-hand drawing
                ['thumb', 'index', 'middle', 'ring'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'SIGN':
                const signCircle = Math.sin(time * 8) * 0.3;
                this.setWrist(signCircle, signCircle, 0); // 1-hands circling
                pointIndex();
                break;
            case 'COMMUNICATE':
                const commBackForth = Math.sin(time * 6) * 0.4;
                this.setWrist(0, 0, commBackForth); // C-hands alternating
                this.setFace('thumb', 0.5);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0.5));
                break;
            case 'EXPLAIN':
                const explainPull = Math.sin(time * 5) * 0.3;
                this.setWrist(0, 0, explainPull); // F-hands pulling out
                this.setFace('thumb', 1.0);
                this.setFace('index', 1.0);
                ['middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0));
                break;
            case 'DESCRIBE':
                const descPull = Math.sin(time * 5) * 0.3;
                this.setWrist(0, 0, descPull); // F-hands
                this.setFace('thumb', 1.0);
                this.setFace('index', 1.0);
                ['middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0));
                break;
            case 'DISCUSS':
                const discussTap = Math.abs(Math.sin(time * 6)) * 0.2;
                this.setWrist(discussTap, 0, 0); // Index finger on palm
                pointIndex();
                break;
            case 'ARGUE':
                const arguePoint = Math.sin(time * 8) * 0.4;
                this.setWrist(0, arguePoint, 0); // 1-hands pointing at each other
                pointIndex();
                break;
            case 'AGREE':
                const agreeNod = Math.sin(time * 4) * 0.3;
                this.setWrist(agreeNod, 0, 0); // Y-hand nodding
                this.setFace('thumb', 0);
                this.setFace('pinky', 0);
                ['index', 'middle', 'ring'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'DISAGREE':
                const disagreeShake = Math.sin(time * 6) * 0.3;
                this.setWrist(-0.2, disagreeShake, 0); // Head shake motion
                pointIndex();
                break;
            case 'PROMISE':
                const promiseSeal = Math.sin(time * 3) * 0.2;
                this.setWrist(0, 0, promiseSeal); // Index to mouth then palm
                pointIndex();
                break;
            case 'WARN':
                const warnTap = Math.abs(Math.sin(time * 6)) * 0.2;
                this.setWrist(0, 0, warnTap); // Pat hand
                flatHand();
                break;
            case 'ADVISE':
                const adviseGive = Math.sin(time * 4) * 0.3;
                this.setWrist(0, 0, adviseGive); // Flattened O spread out
                this.setFace('thumb', 0.8);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0.8));
                break;
            case 'SUGGEST':
                const suggestUp = Math.sin(time * 4) * 0.3;
                this.setWrist(0, suggestUp, 0); // H-hands moving up
                this.setFace('index', 0);
                this.setFace('middle', 0);
                ['thumb', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'REQUEST':
                const reqPull = Math.sin(time * 4) * -0.2;
                this.setWrist(reqPull, 0, 0); // Hands clasped pulling in
                flatHand(); // Prayer position
                break;
            case 'DEMAND':
                const demandPoint = Math.sin(time * 4) * 0.3;
                this.setWrist(0, demandPoint, 0); // Index specific point
                pointIndex();
                break;
            case 'ORDER':
                const orderPoint = Math.sin(time * 4) * 0.4;
                this.setWrist(orderPoint, 0, 0); // Index generic
                pointIndex();
                break;
            case 'INVITE':
                const inviteSweep = Math.sin(time * 4) * -0.3;
                this.setWrist(0, 0, inviteSweep); // Hand sweeps in
                flatHand(); // Palm up
                break;
            case 'GREET':
                const greetWave = Math.sin(time * 5) * 0.4;
                this.setWrist(greetWave, 0, 0);
                flatHand();
                break;
            case 'INTRODUCE':
                const introSweep = Math.sin(time * 4) * 0.3;
                this.setWrist(introSweep, 0, 0); // Hands meet
                flatHand();
                break;
            case 'APOLOGIZE':
                const apologyRub = Math.sin(time * 3) * 0.2;
                this.setWrist(apologyRub, 0, 0); // A-hand on chest
                fist();
                break;
            case 'COMPLAIN':
                const complainTap = Math.abs(Math.sin(time * 6)) * 0.2;
                this.setWrist(complainTap, 0, 0); // C-hand on chest tapping
                this.setFace('thumb', 0.5);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0.5));
                break;
            case 'PRAISE':
                const praiseClap = Math.abs(Math.sin(time * 8)) * 0.3;
                this.setWrist(0, praiseClap, 0); // Clapping
                flatHand();
                break;
            case 'CRITICIZE':
                const critSlash = Math.sin(time * 5) * 0.3;
                this.setWrist(critSlash, -critSlash, 0); // X-mark on palm
                pointIndex();
                break;

            // === MENTAL VERBS ===
            case 'THINK':
                const thinkTap = Math.sin(time * 4) * 0.2;
                this.setWrist(thinkTap + 0.3, 0, 0); // Tap forehead
                pointIndex();
                break;
            case 'KNOW':
                const knowingTap = Math.sin(time * 4) * 0.2;
                this.setWrist(knowingTap + 0.3, 0, 0); // Tap forehead side
                flatHand(); // Bent hand
                break;
            case 'UNDERSTAND':
                const underFlick = Math.abs(Math.sin(time * 6)) * 0.3;
                this.setWrist(underFlick + 0.3, 0, 0); // 1-hand cleaning
                pointIndex();
                break;
            case 'BELIEVE':
                const believeClasp = Math.sin(time * 3) * 0.3;
                this.setWrist(believeClasp, 0, 0); // Mind to hands clasp
                flatHand();
                break;
            case 'REMEMBER':
                const rememberThumb = Math.sin(time * 2) * 0.2;
                this.setWrist(rememberThumb + 0.3, 0, 0); // Thumb to forehead then thumb
                this.setFace('thumb', 0); // A-hand
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'FORGET':
                const forgetSwipe = Math.sin(time * 5) * 0.3;
                this.setWrist(forgetSwipe + 0.3, 0, 0); // Wipe forehead
                flatHand();
                break;
            case 'LEARN':
                const learnAbsorb = Math.sin(time * 4) * 0.2;
                this.setWrist(learnAbsorb + 0.2, 0, 0); // Book to head
                flatHand(); // Fingertips together
                break;
            case 'TEACH':
                const teachOut = Math.sin(time * 4) * 0.3;
                this.setWrist(teachOut + 0.3, 0, 0); // O-hands from head out
                this.setFace('thumb', 1.0);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.0));
                break;
            case 'DECIDE':
                const decideDown = Math.sin(time * 4) * 0.4;
                this.setWrist(0, decideDown, 0); // F-hands downward
                this.setFace('thumb', 0.5);
                this.setFace('index', 0.5);
                ['middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0));
                break;
            case 'CHOOSE':
                const choosePick = Math.sin(time * 3) * 0.3;
                this.setWrist(0, 0, choosePick); // Pinch from air
                this.setFace('thumb', 0.8);
                this.setFace('index', 0.8);
                ['middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'IMAGINE':
                const imagineSpiral = Math.sin(time * 5) * 0.2;
                this.setWrist(imagineSpiral + 0.3, imagineSpiral, 0); // I-hand spiral at head
                this.setFace('pinky', 0);
                ['thumb', 'index', 'middle', 'ring'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'DREAM':
                const dreamSquig = Math.sin(time * 4) * 0.3;
                this.setWrist(dreamSquig + 0.3, 0, 0); // Index squiggle from head
                pointIndex();
                break;
            case 'WONDER':
                const wonderCircle = Math.sin(time * 3) * 0.2;
                this.setWrist(wonderCircle + 0.3, 0, 0); // G-hand circle at forehead
                pointIndex();
                break;
            case 'GUESS':
                const guessSwipe = Math.sin(time * 5) * 0.3;
                this.setWrist(guessSwipe + 0.3, 0, 0); // C-hand across forehead
                this.setFace('thumb', 0.5);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0.5));
                break;
            case 'DOUBT':
                const doubtShake = Math.sin(time * 6) * 0.2;
                this.setWrist(0, doubtShake, 0); // V-hand covering eyes/nose shake
                this.setFace('index', 0);
                this.setFace('middle', 0);
                ['thumb', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'TRUST':
                const trustHold = Math.sin(time * 3) * 0.2;
                this.setWrist(0, 0, trustHold); // Holding onto invisible rope
                fist();
                break;
            case 'HOPE':
                const hopeCross = Math.sin(time * 3) * 0.2;
                this.setWrist(hopeCross + 0.2, 0, 0); // Crossed fingers wave
                this.setFace('index', 0);
                this.setFace('middle', 0); // Crossed? close enough
                ['thumb', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'WISH':
                const wishDown = Math.sin(time * 3) * 0.3;
                this.setWrist(wishDown, 0, 0); // C-hand down chest
                this.setFace('thumb', 0.5);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0.5));
                break;
            case 'EXPECT':
                const expectFlick = Math.sin(time * 5) * 0.2;
                this.setWrist(expectFlick + 0.2, 0, 0); // 1-hand flick from ear
                pointIndex();
                break;
            case 'PLAN':
                const planSweep = Math.sin(time * 4) * 0.4;
                this.setWrist(0, planSweep, 0); // Hands sweep horizontally
                flatHand();
                break;
            case 'PREPARE':
                const prepShake = Math.sin(time * 6) * 0.2;
                this.setWrist(0, prepShake, 0); // T-hands shaking
                this.setFace('thumb', 0.5);
                this.setFace('index', 1.5);
                ['middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'CONSIDER':
                const considerCircle = Math.sin(time * 3) * 0.2;
                this.setWrist(considerCircle + 0.2, 0, 0); // O-hands circling head
                this.setFace('thumb', 1.0);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.0));
                break;
            case 'REALIZE':
                const realTap = Math.abs(Math.sin(time * 8)) * 0.2;
                this.setWrist(realTap + 0.2, 0, 0); // Index tap temple
                pointIndex();
                break;
            case 'RECOGNIZE':
                const recPoint = Math.sin(time * 4) * 0.3;
                this.setWrist(recPoint + 0.2, 0, 0); // Index eye to palm
                pointIndex();
                break;
            case 'NOTICE':
                const noticePoint = Math.sin(time * 4) * 0.3;
                this.setWrist(0, 0, noticePoint); // X-hand from eye to obj
                this.setFace('index', 0.7);
                ['thumb', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'FOCUS':
                const focusNarrow = Math.sin(time * 4) * 0.3;
                this.setWrist(focusNarrow + 0.2, 0, 0); // Blinders to point
                flatHand();
                break;
            case 'CONCENTRATE':
                const concCircle = Math.sin(time * 2) * 0.1;
                this.setWrist(concCircle + 0.2, 0, 0); // Intense gaze
                fist(); // A-hands at eyes
                break;
            case 'ANALYZE':
                const analyzeV = Math.sin(time * 4) * 0.3;
                this.setWrist(0, analyzeV, 0); // V-hands splitting
                this.setFace('index', 0);
                this.setFace('middle', 0);
                ['thumb', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'COMPARE':
                const compBalance = Math.sin(time * 3) * 0.3;
                this.setWrist(0, compBalance, 0); // Hands weighing options
                flatHand(); // Cupped
                break;
            case 'JUDGE':
                const judgeAlt = Math.sin(time * 4) * 0.3;
                this.setWrist(0, judgeAlt, 0); // F-hands alternating scales
                this.setFace('thumb', 0.5);
                this.setFace('index', 0.5);
                ['middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0));
                break;
            case 'EVALUATE':
                const evalCircle = Math.sin(time * 3) * 0.3;
                this.setWrist(0, evalCircle, 0); // E-hands circling
                this.setFace('thumb', 1.5); // E-handISH
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;

            // === PERCEPTION VERBS ===
            case 'SEE':
                const seeTap = Math.sin(time * 5) * 0.2;
                this.setWrist(seeTap + 0.2, 0, 0); // V-hand from eye out
                this.setFace('index', 0);
                this.setFace('middle', 0);
                ['thumb', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'LOOK':
                const lookPoint = Math.sin(time * 4) * 0.3;
                this.setWrist(0, 0, lookPoint); // V-hand pointing
                this.setFace('index', 0);
                this.setFace('middle', 0);
                ['thumb', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'WATCH':
                const watchStare = Math.sin(time * 2) * 0.1;
                this.setWrist(0, 0, watchStare + 0.1);
                this.setFace('index', 0);
                this.setFace('middle', 0);
                ['thumb', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'HEAR':
                const hearTap = Math.abs(Math.sin(time * 6)) * 0.2;
                this.setWrist(hearTap + 0.2, 0, 0); // Tap ear
                pointIndex();
                break;
            case 'LISTEN':
                const listenCup = Math.sin(time * 4) * 0.2;
                this.setWrist(listenCup + 0.2, 0, 0); // Cup ear
                this.setFace('thumb', 0.2); // C-handish
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0.2));
                break;
            case 'FEEL':
                const feelChest = Math.sin(time * 4) * 0.2;
                this.setWrist(feelChest, 0, 0); // Middle finger stroke up chest
                this.setFace('middle', 0);
                ['thumb', 'index', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'TOUCH':
                const touchTap = Math.abs(Math.sin(time * 6)) * 0.2;
                this.setWrist(0, 0, touchTap); // Middle finger tap
                this.setFace('middle', 0);
                ['thumb', 'index', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'SMELL':
                const smellWaft = Math.sin(time * 4) * 0.2;
                this.setWrist(smellWaft + 0.2, 0, 0); // Palm waft to nose
                flatHand();
                break;
            case 'TASTE':
                const tasteTap = Math.abs(Math.sin(time * 6)) * 0.2;
                this.setWrist(tasteTap, 0, 0); // Middle finger tap tongue
                this.setFace('middle', 0);
                ['thumb', 'index', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'SENSE':
                const senseVibe = Math.sin(time * 10) * 0.1;
                this.setWrist(senseVibe, 0, 0);
                flatHand();
                break;
            case 'OBSERVE':
                const obsStare = Math.sin(time * 3) * 0.2;
                this.setWrist(0, 0, obsStare); // V-hands
                this.setFace('index', 0);
                this.setFace('middle', 0);
                ['thumb', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'STARE':
                const stareIntense = Math.sin(time * 2) * 0.1;
                this.setWrist(0, 0, stareIntense + 0.2); // 4-hands intense
                this.setFace('thumb', 1.5);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0));
                break;
            case 'GLANCE':
                const glanceQuick = Math.sin(time * 8) * 0.3;
                this.setWrist(glanceQuick + 0.2, glanceQuick, 0); // V-hand hook
                this.setFace('index', 0);
                this.setFace('middle', 0);
                break;
            case 'PEEK':
                const peekCover = Math.sin(time * 3) * 0.3;
                this.setWrist(peekCover + 0.2, 0, 0); // O-hand eye
                this.setFace('thumb', 1.0);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.0));
                break;
            case 'SEARCH':
                const searchCircle = Math.sin(time * 5) * 0.3;
                this.setWrist(searchCircle + 0.2, searchCircle, 0); // C-hand circling face
                this.setFace('thumb', 0.5);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0.5));
                break;
            case 'FIND':
                const findPick = Math.sin(time * 6) * 0.4;
                this.setWrist(0, findPick, 0); // F-hand picking up
                this.setFace('thumb', 0.8);
                this.setFace('index', 0.8);
                ['middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0));
                break;
            case 'DISCOVER':
                const discFound = Math.sin(time * 6) * 0.4;
                this.setWrist(0, discFound, 0); // S-hand to 1-hand
                this.setFace('thumb', 1.5); // Start S
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'SPOT':
                const spotPoint = Math.sin(time * 8) * 0.5;
                this.setWrist(0, 0, spotPoint); // FAST point
                pointIndex();
                break;
            case 'DETECT':
                const detectSense = Math.sin(time * 4) * 0.2;
                this.setWrist(detectSense + 0.2, 0, 0); // Middle finger brush
                this.setFace('middle', 0);
                ['thumb', 'index', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            // === STATE VERBS ===
            case 'BE':
                const beHold = Math.sin(time * 3) * 0.2;
                this.setWrist(0, beHold, 0); // B-hand held
                flatHand();
                break;
            case 'HAVE':
                const haveIn = Math.sin(time * 4) * 0.3;
                this.setWrist(haveIn, 0, 0); // Hands to chest
                flatHand(); // Bent
                break;
            case 'BECOME':
                const becomeTwist = Math.sin(time * 4) * 0.4;
                this.setWrist(becomeTwist, becomeTwist, 0); // Palms twist
                flatHand();
                break;
            case 'STAY':
                const stayPush = Math.sin(time * 5) * 0.4;
                this.setWrist(0, 0, stayPush); // Y-hands down
                this.setFace('thumb', 0);
                this.setFace('pinky', 0);
                ['index', 'middle', 'ring'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'REMAIN':
                const remainDown = Math.sin(time * 3) * 0.3;
                this.setWrist(0, 0, remainDown); // Y-hands stay
                this.setFace('thumb', 0);
                this.setFace('pinky', 0);
                ['index', 'middle', 'ring'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'SEEM':
                const seemTurn = Math.sin(time * 4) * 0.2;
                this.setWrist(seemTurn, 0, 0); // Hand twist
                flatHand();
                break;
            case 'APPEAR':
                const appearPop = Math.abs(Math.sin(time * 6)) * 0.4;
                this.setWrist(0, appearPop, 0); // Pop up between index/middle
                pointIndex();
                break;
            case 'EXIST':
                const existDown = Math.sin(time * 3) * 0.2;
                this.setWrist(existDown, 0, 0);
                flatHand();
                break;
            case 'LIVE':
                const liveUp = Math.sin(time * 4) * 0.4;
                this.setWrist(0, liveUp, 0); // L-hands up chest
                this.setFace('thumb', 0);
                this.setFace('index', 0);
                ['middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'DIE':
                const dieFlip = Math.sin(time * 4) * 0.5;
                this.setWrist(dieFlip, 0, 0); // Palms flip over
                flatHand();
                break;
            case 'BELONG':
                const belongConnect = Math.sin(time * 4) * 0.3;
                this.setWrist(belongConnect, 0, 0); // F-hands connect
                this.setFace('thumb', 0.8);
                this.setFace('index', 0.8);
                ['middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0));
                break;
            case 'CONTAIN':
                const containCup = Math.sin(time * 3) * 0.3;
                this.setWrist(0, containCup, 0); // C-hands
                this.setFace('thumb', 0.5);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0.5));
                break;
            case 'INCLUDE':
                const includeSweep = Math.sin(time * 4) * 0.4;
                this.setWrist(includeSweep, 0, 0); // 5-hand into C
                flatHand();
                break;
            case 'INVOLVE':
                const involveCir = Math.sin(time * 4) * 0.3;
                this.setWrist(involveCir, 0, 0); // C-hand into 5
                this.setFace('thumb', 0.5);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0.5));
                break;
            case 'REQUIRE':
                const reqPullIn = Math.sin(time * 5) * 0.3;
                this.setWrist(reqPullIn, 0, 0); // X-hand pull
                this.setFace('index', 0.7);
                ['thumb', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'HATE':
                const hateFlick = Math.sin(time * 6) * 0.4;
                this.setWrist(hateFlick, 0, 0); // Middle fingers flick out
                this.setFace('middle', 0);
                ['thumb', 'index', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'PREFER':
                const preferTouch = Math.sin(time * 4) * 0.2;
                this.setWrist(preferTouch, 0, 0); // Middle finger chin chest
                this.setFace('middle', 0);
                ['thumb', 'index', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'DESERVE':
                const deserveTap = Math.sin(time * 5) * 0.3;
                this.setWrist(0, 0, deserveTap); // Hands tap together
                flatHand(); // Claw
                break;
            case 'OWE':
                const owePoint = Math.sin(time * 4) * 0.3;
                this.setWrist(owePoint, 0, 0); // Index to palm
                pointIndex();
                break;
            case 'OWN':
                const ownIn = Math.sin(time * 3) * 0.3;
                this.setWrist(ownIn, 0, 0); // Hands to chest
                flatHand(); // Closed 5
                break;
            case 'POSSESS':
                const possessChest = Math.sin(time * 3) * 0.3;
                this.setWrist(possessChest, 0, 0); // Hands on chest
                flatHand();
                break;

            // === PLACE NOUNS ===
            case 'OFFICE':
                const officeWall = Math.sin(time * 4) * 0.3;
                this.setWrist(0, officeWall, 0); // O-hands wall
                this.setFace('thumb', 1.0);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.0));
                break;
            // HOUSE, HOME, SCHOOL, STORE, SHOP, HOSPITAL, CHURCH, PARK, BEACH, POOL skipped (duplicate)
            case 'GARDEN':
                const gardenBloom = Math.sin(time * 4) * 0.3;
                this.setWrist(0, gardenBloom, 0); // 5-hands blooming
                this.setFace('thumb', 1.0); // O to 5
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0.5 + Math.sin(time * 5) * 0.5));
                break;
            case 'YARD':
                const yardZone = Math.sin(time * 4) * 0.4;
                this.setWrist(yardZone, 0, 0); // Y-hands boundary
                this.setFace('thumb', 0);
                this.setFace('pinky', 0);
                ['index', 'middle', 'ring'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'MOUNTAIN':
                const mtnSlope = Math.sin(time * 4) * 0.5;
                this.setWrist(mtnSlope, mtnSlope * 0.5, 0); // Fist slope up
                fist();
                break;
            case 'FOREST':
                const forestTree = Math.sin(time * 5) * 0.3;
                this.setWrist(forestTree, 0, 0); // Tree sign repeated
                flatHand(); // 5-hand
                break;
            case 'LAKE':
                const lakeSplash = Math.sin(time * 4) * 0.3;
                this.setWrist(0, lakeSplash, 0); // Water + L shape
                this.setFace('thumb', 0);
                this.setFace('index', 0);
                ['middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'RIVER':
                const riverFlow = Math.sin(time * 3) * 0.4;
                this.setWrist(riverFlow, 0, 0); // W-hands flowing
                this.setFace('thumb', 1.5);
                ['index', 'middle', 'ring'].forEach(f => this.setFace(f as FingerName, 0));
                this.setFace('pinky', 1.5);
                break;
            case 'OCEAN':
                const oceanWave = Math.sin(time * 3) * 0.5;
                this.setWrist(oceanWave, 0, oceanWave * 0.2); // W-hands waves
                this.setFace('thumb', 1.5);
                ['index', 'middle', 'ring'].forEach(f => this.setFace(f as FingerName, 0));
                this.setFace('pinky', 1.5);
                break;
            case 'RESTAURANT':
                const restWipe = Math.sin(time * 5) * 0.3;
                this.setWrist(restWipe, 0, 0); // R-hands wiping mouth
                this.setFace('index', 0);
                this.setFace('middle', 0); // Crossed R
                ['thumb', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'CAFE':
                const cafeDrink = Math.sin(time * 4) * 0.2;
                this.setWrist(cafeDrink, 0, 0); // C-hand drink
                this.setFace('thumb', 0.5);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0.5));
                break;
            case 'BAR':
                const barThumb = Math.sin(time * 4) * 0.2;
                this.setWrist(barThumb, 0, 0); // A-hand to mouth
                fist();
                break;
            case 'LIBRARY':
                const libCircle = Math.sin(time * 4) * 0.3;
                this.setWrist(libCircle, libCircle, 0); // L-hand circle
                this.setFace('thumb', 0);
                this.setFace('index', 0);
                ['middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'MUSEUM':
                const musM = Math.sin(time * 4) * 0.3;
                this.setWrist(musM, 0, 0); // M-hand house
                this.setFace('thumb', 1.5);
                ['index', 'middle', 'ring'].forEach(f => this.setFace(f as FingerName, 0));
                this.setFace('pinky', 1.5); // M shape
                break;
            case 'THEATER':
                const theaterActs = Math.sin(time * 4) * 0.4;
                this.setWrist(theaterActs, 0, 0); // A-hands rotating chest
                fist();
                break;
            case 'CINEMA':
                const cinemaFlick = Math.sin(time * 6) * 0.3;
                this.setWrist(cinemaFlick, 0, 0); // Hand flicker
                flatHand();
                break;
            case 'GYM':
                const gymRep = Math.sin(time * 5) * 0.4;
                this.setWrist(gymRep, 0, 0); // Rope pull
                fist();
                break;
            case 'STADIUM':
                const stadArena = Math.sin(time * 4) * 0.5;
                this.setWrist(0, stadArena, 0); // C-hands wide area
                this.setFace('thumb', 0.5);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0.5));
                break;
            case 'ARENA':
                const arenaArea = Math.sin(time * 4) * 0.5;
                this.setWrist(0, arenaArea, 0);
                flatHand();
                break;
            case 'BANK':
                const bankStack = Math.sin(time * 5) * 0.3;
                this.setWrist(bankStack, 0, 0);
                this.setFace('thumb', 0); // B-hand spelled or Money sign
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0));
                break;
            case 'HOTEL':
                const hotelFlag = Math.sin(time * 4) * 0.3;
                this.setWrist(0, hotelFlag, 0); // H-hand flap
                this.setFace('index', 0);
                this.setFace('middle', 0);
                ['thumb', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'MOTEL':
                const motelM = Math.sin(time * 4) * 0.3;
                this.setWrist(0, motelM, 0); // M-hand flap
                this.setFace('thumb', 1.5);
                this.setFace('pinky', 1.5);
                ['index', 'middle', 'ring'].forEach(f => this.setFace(f as FingerName, 0));
                break;
            case 'AIRPORT':
                const airFly = Math.sin(time * 5) * 0.5;
                this.setWrist(airFly, 0, airFly * 0.3); // ILY flying
                this.setFace('thumb', 0);
                this.setFace('index', 0);
                this.setFace('pinky', 0);
                ['middle', 'ring'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'STATION':
                const statBase = Math.sin(time * 2) * 0.2;
                this.setWrist(statBase, 0, 0); // Base setting
                flatHand();
                break;
            case 'PORT':
                const portDock = Math.sin(time * 3) * 0.3;
                this.setWrist(portDock, 0, 0); // Boat docking
                flatHand(); // Cupped
                break;
            case 'CITY':
                const cityTwist = Math.sin(time * 4) * 0.3;
                this.setWrist(cityTwist, cityTwist, 0); // Roof twisting
                this.setFace('thumb', 0); // B-hands twisting
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0));
                break;
            case 'TOWN':
                const townRoof = Math.sin(time * 3) * 0.3;
                this.setWrist(townRoof, 0, 0); // Roof shape repeated
                flatHand();
                break;
            case 'VILLAGE':
                const villV = Math.sin(time * 3) * 0.3;
                this.setWrist(villV, 0, 0); // Roof with V
                this.setFace('index', 0);
                this.setFace('middle', 0);
                ['thumb', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'COUNTRY':
                const countryRub = Math.sin(time * 4) * 0.3;
                this.setWrist(countryRub, 0, 0); // Y-hand rubbing elbow
                this.setFace('thumb', 0);
                this.setFace('pinky', 0);
                ['index', 'middle', 'ring'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'STATE':
                const stateS = Math.sin(time * 3) * 0.3;
                this.setWrist(stateS, 0, 0); // S-hand palm down
                fist();
                break;
            case 'WORLD':
                const worldCir = Math.sin(time * 3) * 0.4;
                this.setWrist(worldCir, worldCir, 0); // W-hands circle
                this.setFace('thumb', 1.5);
                this.setFace('pinky', 1.5);
                ['index', 'middle', 'ring'].forEach(f => this.setFace(f as FingerName, 0));
                break;
            case 'ROOM':
                const roomBox = Math.sin(time * 4) * 0.4;
                this.setWrist(roomBox, 0, 0); // Box shape
                flatHand();
                break;
            case 'KITCHEN':
                const kitchK = Math.sin(time * 4) * 0.3;
                this.setWrist(kitchK, 0, 0); // K-hand shaking
                this.setFace('thumb', 0);
                this.setFace('index', 0);
                this.setFace('middle', 0);
                ['ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'BATHROOM':
                const bathT = Math.sin(time * 6) * 0.2;
                this.setWrist(bathT, 0, 0); // T-hand shaking
                this.setFace('thumb', 0.5); // T shape
                this.setFace('index', 1.5);
                ['middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'BEDROOM':
                const bedSleep2 = Math.sin(time * 2) * 0.3;
                this.setWrist(bedSleep2, 0, 0); // Sleep sign + room
                flatHand();
                break;
            case 'LIVING':
                const livingL = Math.sin(time * 3) * 0.3;
                this.setWrist(livingL, 0, 0); // A-hands up chest (Live) + room
                fist(); // But starting with Live
                break;
            case 'DINING':
                const dineEat = Math.sin(time * 5) * 0.3;
                this.setWrist(dineEat, 0, 0); // Eat sign + room
                this.setFace('thumb', 0.7);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0.7));
                break;
            case 'GARAGE':
                const garageCar = Math.sin(time * 4) * 0.3;
                this.setWrist(garageCar, 0, 0); // Car under roof
                this.setFace('thumb', 1.5);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0)); // 3-hand vehicle
                break;
            case 'BASEMENT':
                const baseUnder = Math.sin(time * 4) * 0.3;
                this.setWrist(0, -baseUnder, 0); // Thumb under flat hand
                thumbsUp();
                break;
            case 'ATTIC':
                const atticTop = Math.sin(time * 4) * 0.3;
                this.setWrist(0, atticTop, 0); // A-hand on head
                fist();
                break;
            case 'FLOOR':
                const floorFlat = Math.sin(time * 4) * 0.4;
                this.setWrist(floorFlat, 0, 0); // Flat hands separate
                flatHand();
                break;
            case 'CEILING':
                const ceilUp = Math.sin(time * 4) * 0.4;
                this.setWrist(ceilUp, 0.5, 0); // Flat hands up
                flatHand();
                break;
            case 'WALL':
                const wallSide = Math.sin(time * 4) * 0.4;
                this.setWrist(0, wallSide, 0); // Flat hand vertical slide
                flatHand();
                break;
            case 'CORNER':
                const cornerMeet = Math.sin(time * 3) * 0.2;
                this.setWrist(cornerMeet, 0, 0); // Hands meet angle
                flatHand();
                break;
            case 'HALLWAY':
                const hallWay = Math.sin(time * 4) * 0.4;
                this.setWrist(0, 0, hallWay); // Parallel hands forward
                flatHand();
                break;
            case 'STAIRS':
                const stairClimb = Math.sin(time * 6) * 0.4;
                this.setWrist(0, stairClimb, stairClimb * 0.5); // Fingers walking up
                this.setFace('index', 0);
                this.setFace('middle', 0);
                ['thumb', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'ELEVATOR':
                const elevUp = Math.sin(time * 4) * 0.4;
                this.setWrist(0, elevUp, 0); // E-hand moving up
                this.setFace('thumb', 1.5);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'LOBBY':
                const lobbyL = Math.sin(time * 5) * 0.3;
                this.setWrist(lobbyL, 0, 0); // L-hand
                this.setFace('thumb', 0);
                this.setFace('index', 0);
                ['middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'ENTRANCE':
                const enterScoop = Math.sin(time * 4) * 0.3;
                this.setWrist(0, 0, enterScoop); // Swoop under
                flatHand();
                break;
            case 'EXIT':
                const exitPoint = Math.sin(time * 4) * 0.3;
                this.setWrist(exitPoint, 0, 0); // Point out
                pointIndex();
                break;
            case 'STREET':
            case 'ROAD':
            case 'HIGHWAY':
            case 'PATH':
                const roadPath = Math.sin(time * 4) * 0.5;
                this.setWrist(0, 0, roadPath); // Parallel hands
                flatHand();
                break;
            case 'SIDEWALK':
                const sidePath = Math.sin(time * 4) * 0.4;
                this.setWrist(sidePath, 0, sidePath);
                flatHand();
                break;
            case 'BRIDGE':
                const bridgeArc = Math.sin(time * 3) * 0.3;
                this.setWrist(0, bridgeArc, 0); // 2-fingers on arm
                this.setFace('index', 0);
                this.setFace('middle', 0);
                ['thumb', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'TUNNEL':
                const tunnelThru = Math.sin(time * 4) * 0.4;
                this.setWrist(0, 0, tunnelThru); // Hand under flat hand
                flatHand(); // Cupped
                break;
            case 'INTERSECTION':
                const interCross = Math.sin(time * 3) * 0.2;
                this.setWrist(interCross, 0, 0); // Index fingers cross
                pointIndex();
                break;
            case 'NEIGHBORHOOD':
                const neighborHouse = Math.sin(time * 4) * 0.3;
                this.setWrist(neighborHouse, 0, 0); // House + area
                flatHand();
                break;
            case 'DOWNTOWN':
                const downT = Math.sin(time * 4) * 0.3;
                this.setWrist(downT, -downT, 0); // D -> T down
                pointIndex(); // D hand
                break;
            case 'SUBURB':
                const subArea = Math.sin(time * 4) * 0.4;
                this.setWrist(subArea, 0, 0);
                flatHand();
                break;
            // === PERSON NOUNS ===
            case 'SON':
                const sonSalute = Math.sin(time * 4) * 0.3;
                this.setWrist(sonSalute + 0.3, 0, 0); // Salute to baby
                this.setFace('index', 0);
                this.setFace('middle', 0);
                ['thumb', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'DAUGHTER':
                const daughtLine = Math.sin(time * 4) * 0.3;
                this.setWrist(daughtLine, 0, 0); // Chin line to baby
                flatHand();
                break;
            case 'PARENT':
                const parentP = Math.sin(time * 4) * 0.3;
                this.setWrist(parentP + 0.3, 0, 0); // Mom + Dad
                this.setFace('thumb', 1.5); // P-hand
                this.setFace('index', 0);
                ['middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'GRANDMA':
            case 'GRANDMOTHER':
                const gmaBump = Math.sin(time * 4) * 0.3;
                this.setWrist(gmaBump, 0, 0); // Mom out
                flatHand();
                break;
            case 'GRANDPA':
            case 'GRANDFATHER':
                const gpaBump = Math.sin(time * 4) * 0.3;
                this.setWrist(gpaBump + 0.3, 0, 0); // Dad out
                flatHand();
                break;
            case 'AUNT':
                const auntA = Math.sin(time * 5) * 0.2;
                this.setWrist(auntA, 0, 0); // A at chin
                fist();
                break;
            case 'UNCLE':
                const uncleU = Math.sin(time * 5) * 0.2;
                this.setWrist(uncleU + 0.3, 0, 0); // U at forehead
                this.setFace('index', 0);
                this.setFace('middle', 0);
                ['thumb', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'COUSIN':
                const cousinC = Math.sin(time * 5) * 0.2;
                this.setWrist(cousinC + 0.2, 0, 0); // C at ear
                this.setFace('thumb', 0.5);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0.5));
                break;
            case 'NIECE':
                const nieceN = Math.sin(time * 4) * 0.2;
                this.setWrist(nieceN, 0, 0); // N at chin
                this.setFace('thumb', 1.5); // N-hand
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'NEPHEW':
                const nephewN = Math.sin(time * 4) * 0.2;
                this.setWrist(nephewN + 0.3, 0, 0); // N at forehead
                this.setFace('thumb', 1.5);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'NEIGHBOR':
                const neighborSide = Math.sin(time * 4) * 0.3;
                this.setWrist(neighborSide, 0, 0); // Beside
                flatHand();
                break;
            case 'STRANGER':
                const strangerLook = Math.sin(time * 3) * 0.3;
                this.setWrist(0, 0, strangerLook); // Question face
                this.setFace('index', 0.5); // Curved index
                break;
            case 'PERSON':
                const personP2 = Math.sin(time * 4) * 0.4;
                this.setWrist(0, -personP2, 0); // P-hands down
                this.setFace('thumb', 1.5);
                this.setFace('index', 0);
                ['middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'PEOPLE':
                const peopleCircle = Math.sin(time * 5) * 0.3;
                this.setWrist(peopleCircle, peopleCircle, 0); // P-circles
                this.setFace('thumb', 1.5);
                this.setFace('index', 0);
                ['middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'MAN':
                const manChest = Math.sin(time * 3) * 0.3;
                this.setWrist(manChest + 0.3, 0, 0); // Forehead to chest
                flatHand();
                break;
            case 'WOMAN':
                const womanChin = Math.sin(time * 3) * 0.3;
                this.setWrist(womanChin, 0, 0); // Chin to chest
                flatHand();
                break;
            case 'BOY':
                const boyCap = Math.sin(time * 4) * 0.2;
                this.setWrist(boyCap + 0.3, 0, 0); // Grab cap
                this.setFace('thumb', 0.5);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0.5));
                break;
            case 'GIRL':
                const girlBonnet = Math.sin(time * 4) * 0.2;
                this.setWrist(girlBonnet, 0, 0); // Bonnet string chin
                fist(); // A-hand
                break;

            // === OBJECT NOUNS ===
            // Existing unique cases: CAR, PHONE, COMPUTER, BOOK, BOWL, MONEY, TABLE, BED
            case 'LAPTOP':
                const laptopOpen = Math.sin(time * 3) * 0.5;
                this.setWrist(laptopOpen, 0, 0); // Open hinges
                flatHand();
                break;
            case 'TABLET':
                const tabTap = Math.sin(time * 5) * 0.2;
                this.setWrist(0, tabTap, 0); // Tap hand
                pointIndex();
                break;
            case 'KEYBOARD':
                const keyType = Math.sin(time * 12) * 0.1;
                this.setWrist(0, 0, keyType); // Fast typing
                this.setFace('thumb', 0.5);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0.2 + Math.random() * 0.3));
                break;
            case 'MOUSE':
                const mouseClick = Math.sin(time * 8) * 0.1;
                this.setWrist(0, 0, mouseClick); // Click index
                this.setFace('index', 0.2);
                ['thumb', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0.5));
                break;
            case 'SCREEN':
                const screenBox = Math.sin(time * 4) * 0.4;
                this.setWrist(screenBox, 0, 0); // 4-hands box
                this.setFace('thumb', 1.5);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0));
                break;
            case 'CAMERA':
                const camClick = Math.sin(time * 3) * 0.1;
                this.setWrist(camClick + 0.3, 0, 0); // Click button
                this.setFace('index', 0.5); // Curved index
                this.setFace('thumb', 0.5);
                break;
            case 'BUS':
                const busWheel = Math.sin(time * 3) * 0.4;
                this.setWrist(0, busWheel, 0); // Big wheel
                fist();
                break;
            case 'TRAIN':
                const trainRide = Math.sin(time * 8) * 0.3;
                this.setWrist(0, trainRide, 0); // H-hands sliding
                this.setFace('index', 0);
                this.setFace('middle', 0);
                ['thumb', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'PLANE':
                const planeFly = Math.sin(time * 5) * 0.5;
                this.setWrist(planeFly + 0.3, 0, 0); // ILY flying
                this.setFace('thumb', 0);
                this.setFace('index', 0);
                this.setFace('pinky', 0);
                ['middle', 'ring'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'BOAT':
                const boatRock = Math.sin(time * 3) * 0.4;
                this.setWrist(0, boatRock, 0); // Cupped hands rock
                flatHand();
                break;
            case 'BICYCLE':
                const bikePedal = Math.sin(time * 6) * 0.4;
                this.setWrist(bikePedal, 0, 0); // Fists circling
                fist();
                break;
            case 'DOOR':
                const doorOpen = Math.sin(time * 3) * 0.6;
                this.setWrist(0, 0, doorOpen); // B-hands opening
                flatHand();
                break;
            case 'WINDOW':
                const winUp = Math.sin(time * 3) * 0.4;
                this.setWrist(0, winUp, 0); // B-hands up/down
                flatHand();
                break;
                break;

            case 'CLOTHES':
                const clothRub = Math.sin(time * 4) * 0.3;
                this.setWrist(0, -clothRub, 0); // 5-hands brush chest
                flatHand();
                break;
            case 'SHOES':
                const shoeTap = Math.sin(time * 6) * 0.3;
                this.setWrist(shoeTap, 0, 0); // S-hands tap
                fist();
                break;
            case 'FOOD':
                const foodMouth = Math.sin(time * 5) * 0.3;
                this.setWrist(foodMouth, 0, 0); // O-hand to mouth
                this.setFace('thumb', 1.0);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.0));
                break;
            case 'WATER':
                const waterTap = Math.sin(time * 4) * 0.2;
                this.setWrist(waterTap, 0, 0); // W-hand tap chin
                this.setFace('thumb', 1.5);
                ['index', 'middle', 'ring'].forEach(f => this.setFace(f as FingerName, 0));
                this.setFace('pinky', 1.5);
                break;

            // === ANIMAL NOUNS ===
            case 'DOG':
                const dogSnap = Math.sin(time * 6) * 0.3;
                this.setWrist(dogSnap, 0, 0); // Snap fingers
                this.setFace('middle', 0.5); // Snap setup
                this.setFace('thumb', 0.5);
                break;
            case 'CAT':
                const catWh = Math.sin(time * 4) * 0.3;
                this.setWrist(catWh, 0, 0); // Whiskers
                this.setFace('thumb', 0.5);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0.5));
                break;
            case 'BIRD':
                const birdBeak = Math.sin(time * 8) * 0.2;
                this.setWrist(birdBeak, 0, 0); // Beak open/close
                this.setFace('index', 0.8 * Math.abs(Math.sin(time * 5)));
                this.setFace('thumb', 0.8 * Math.abs(Math.sin(time * 5)));
                break;
            case 'FISH':
                const fishSwim = Math.sin(time * 6) * 0.4;
                this.setWrist(0, fishSwim, 0); // B-hand wiggle
                flatHand();
                break;
            case 'HORSE':
                const horseEar = Math.sin(time * 5) * 0.2;
                this.setWrist(horseEar + 0.3, 0, 0); // U-hand thumbs ear
                this.setFace('index', 0);
                this.setFace('middle', 0);
                ['thumb', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'COW':
                const cowHorn = Math.sin(time * 4) * 0.3;
                this.setWrist(cowHorn + 0.3, 0, 0); // Y-hand horn
                this.setFace('thumb', 0);
                this.setFace('pinky', 0);
                ['index', 'middle', 'ring'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'PIG':
                const pigChin = Math.sin(time * 5) * 0.2;
                this.setWrist(pigChin, 0, 0); // Hand under chin flap
                flatHand();
                break;
            case 'POOL': // Restored
                const poolSwim = Math.sin(time * 5) * 0.5;
                this.setWrist(poolSwim, 0, 0);
                flatHand();
                break;

            // === TIME NOUNS ===
            case 'TIME':
                const timeTap = Math.sin(time * 4) * 0.2;
                this.setWrist(0, timeTap, timeTap); // Tap wrist
                pointIndex();
                break;
            case 'NOW':
                const nowDown = Math.sin(time * 3) * 0.4;
                this.setWrist(0, nowDown, 0); // Y-hands down
                this.setFace('thumb', 0);
                this.setFace('pinky', 0);
                ['index', 'middle', 'ring'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'DAY':
                const dayArc = Math.sin(time * 3) * 0.6;
                this.setWrist(dayArc, 0, 0); // Arm arc
                pointIndex();
                break;
            case 'NIGHT':
                const nightCover = Math.sin(time * 3) * 0.4;
                this.setWrist(0, 0, nightCover); // Hand over hand
                flatHand(); // Cupped
                break;
            case 'MORNING':
                const mornUp = Math.sin(time * 3) * 0.4;
                this.setWrist(mornUp, 0, 0); // Hand rising
                flatHand();
                break;
            case 'WEEK':
                const weekSlide = Math.sin(time * 4) * 0.4;
                this.setWrist(0, weekSlide, 0); // Index slide on palm
                pointIndex();
                break;
            case 'MONTH':
                const monthSlide = Math.sin(time * 4) * 0.4;
                this.setWrist(monthSlide, 0, 0); // Index down finger
                pointIndex();
                break;
            case 'YEAR':
                const yearCircle = Math.sin(time * 3) * 0.4;
                this.setWrist(yearCircle, yearCircle, 0); // S-hands circle
                fist();
                break;
            case 'TODAY':
                const todayBounce = Math.sin(time * 5) * 0.3;
                this.setWrist(0, todayBounce, 0); // Y-hands bounce
                this.setFace('thumb', 0);
                this.setFace('pinky', 0);
                ['index', 'middle', 'ring'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'TOMORROW':
                const tomThm = Math.sin(time * 4) * 0.3;
                this.setWrist(tomThm + 0.3, 0, 0); // A-hand cheek forward
                this.setFace('thumb', 0);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'YESTERDAY':
                const yestThm = Math.sin(time * 4) * 0.3;
                this.setWrist(yestThm + 0.3, 0, 0); // A-hand cheek back
                this.setFace('thumb', 0);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;

            // === ADJECTIVES (Emotions, Colors, etc) ===
            case 'HAPPY':
                // Open hands chest up
                const happyUp = Math.sin(time * 4) * 0.5;
                this.setWrist(happyUp, 0, 0);
                flatHand();
                break;
            case 'SAD':
                // Hands down face
                const sadDown = Math.sin(time * 3) * 0.4;
                this.setWrist(0, -sadDown, 0);
                flatHand();
                break;
            case 'ANGRY':
                // Claw hand face
                const angryClaw = Math.sin(time * 5) * 0.5;
                this.setWrist(angryClaw, 0, 0);
                this.setFace('thumb', 0.5);
                ['index', 'middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 0.8));
                break;
            case 'RED':
                // Index chin pull
                const redPull = Math.sin(time * 4) * 0.3;
                this.setWrist(redPull, 0, 0);
                pointIndex();
                break;
            case 'BLUE':
                // B shake
                const blueShake = Math.sin(time * 10) * 0.3;
                this.setWrist(blueShake, 0, 0);
                flatHand();
                break;
            case 'GREEN':
                // G shake
                const greenShake = Math.sin(time * 10) * 0.3;
                this.setWrist(greenShake, 0, 0);
                this.setFace('thumb', 0);
                this.setFace('index', 0);
                ['middle', 'ring', 'pinky'].forEach(f => this.setFace(f as FingerName, 1.5));
                break;
            case 'MANY':
                // Hands spread wiggling
                const manyWiggle = Math.sin(time * 10) * 0.1;
                this.setWrist(0, 0, manyWiggle);
                flatHand();
                break;

            default:
                const word = state;
                // Generic catchall - VISIBLE signing motion for ANY word
                // Use word length to create variety in the animation
                const wordHash = word.length % 5;
                const speed = 4 + wordHash;
                const amplitude = 0.5;

                const motion = Math.sin(time * speed) * amplitude;

                // Vary the gesture based on first letter
                const firstChar = word.charCodeAt(0) % 4;

                if (firstChar === 0) {
                    // Wave motion
                    this.setWrist(motion, 0, motion * 0.5);
                    flatHand();
                } else if (firstChar === 1) {
                    // Pointing motion  
                    this.setWrist(0, motion * 0.5, motion);
                    pointIndex();
                } else if (firstChar === 2) {
                    // Fist motion
                    this.setWrist(motion * 0.7, 0, 0);
                    fist();
                } else {
                    // Thumbs motion
                    this.setWrist(0, motion, motion * 0.3);
                    thumbsUp();
                }
                break;
        }
    }

    updateLerp() {
        const factor = 0.25; // Natural, smooth movements

        // Use local lerp helper instead of THREE.Math.lerp (deprecated)
        this.currentState.wristRot.x = lerp(this.currentState.wristRot.x, this.targetState.wristRot.x, factor);
        this.currentState.wristRot.y = lerp(this.currentState.wristRot.y, this.targetState.wristRot.y, factor);
        this.currentState.wristRot.z = lerp(this.currentState.wristRot.z, this.targetState.wristRot.z, factor);

        for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky'] as FingerName[]) {
            this.currentState.fingerCurls[f] = lerp(
                this.currentState.fingerCurls[f],
                this.targetState.fingerCurls[f],
                factor
            );
        }
    }

    applyToMesh() {
        // Apply currentState to ThreeJS objects
        this.wrist.rotation.copy(this.currentState.wristRot);

        for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky'] as FingerName[]) {
            const curl = this.currentState.fingerCurls[f];
            const fingerObj = this.fingers[f];
            if (!fingerObj) continue;

            // Apply curl to segments (distributed)
            fingerObj.segments.forEach((seg, i) => {
                // Base joint usually moves less, tips more? Or uniform? 
                // Uniform is fine for simple robot hand.
                seg.rotation.x = curl;
            });
        }
    }
}
