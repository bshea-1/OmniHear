// ASL Finger configurations
// 0.0 = Open/Extended, 1.5 = Curled/Closed
// Thumb rotation is handled specifically if needed, but simplified here to curls.
// Some letters need extra logic (like Z drawing in air, or J), but we'll approximate with static poses for this MVP.

export const ASL_ALPHABET: { [key: string]: { thumb: number, index: number, middle: number, ring: number, pinky: number } } = {
    'a': { thumb: 0.1, index: 1.5, middle: 1.5, ring: 1.5, pinky: 1.5 }, // Thumb out, fingers curled
    'b': { thumb: 1.5, index: 0.0, middle: 0.0, ring: 0.0, pinky: 0.0 }, // Palm open, thumb tucked
    'c': { thumb: 0.5, index: 0.5, middle: 0.5, ring: 0.5, pinky: 0.5 }, // C-shape (partial curl)
    'd': { thumb: 1.5, index: 0.0, middle: 1.5, ring: 1.5, pinky: 1.5 }, // Index up
    'e': { thumb: 1.5, index: 1.5, middle: 1.5, ring: 1.5, pinky: 1.5 }, // Claw/Fist
    'f': { thumb: 1.5, index: 1.2, middle: 0.0, ring: 0.0, pinky: 0.0 }, // OK sign (Index+Thumb touch, rest open)
    'g': { thumb: 0.5, index: 0.2, middle: 1.5, ring: 1.5, pinky: 1.5 }, // Pointing sideways
    'h': { thumb: 1.5, index: 0.2, middle: 0.2, ring: 1.5, pinky: 1.5 }, // Index+Middle sideways
    'i': { thumb: 1.4, index: 1.5, middle: 1.5, ring: 1.5, pinky: 0.0 }, // Pinky up
    'j': { thumb: 1.4, index: 1.5, middle: 1.5, ring: 1.5, pinky: 0.0 }, // Same as I but animated (static for now)
    'k': { thumb: 0.5, index: 0.0, middle: 0.5, ring: 1.5, pinky: 1.5 }, // V shape with thumb
    'l': { thumb: 0.0, index: 0.0, middle: 1.5, ring: 1.5, pinky: 1.5 }, // L shape
    'm': { thumb: 1.2, index: 1.2, middle: 1.2, ring: 1.2, pinky: 1.5 }, // Thumb under fingers
    'n': { thumb: 1.2, index: 1.2, middle: 1.2, ring: 1.5, pinky: 1.5 }, // Thumb under 2 fingers
    'o': { thumb: 1.2, index: 1.2, middle: 1.2, ring: 1.2, pinky: 1.2 }, // O shape
    'p': { thumb: 0.5, index: 0.5, middle: 0.0, ring: 1.5, pinky: 1.5 }, // Downward K
    'q': { thumb: 0.5, index: 0.5, middle: 1.5, ring: 1.5, pinky: 1.5 }, // Downward G
    'r': { thumb: 1.5, index: 0.1, middle: 0.1, ring: 1.5, pinky: 1.5 }, // Crossed fingers (simulated)
    's': { thumb: 1.2, index: 1.4, middle: 1.4, ring: 1.4, pinky: 1.4 }, // Fist
    't': { thumb: 0.5, index: 1.2, middle: 1.5, ring: 1.5, pinky: 1.5 }, // Thumb between index/middle
    'u': { thumb: 1.5, index: 0.0, middle: 0.0, ring: 1.5, pinky: 1.5 }, // U shape
    'v': { thumb: 1.5, index: 0.0, middle: 0.0, ring: 1.5, pinky: 1.5 }, // V shape (splayed) -- approximation
    'w': { thumb: 1.2, index: 0.0, middle: 0.0, ring: 0.0, pinky: 1.5 }, // W shape
    'x': { thumb: 1.2, index: 0.8, middle: 1.5, ring: 1.5, pinky: 1.5 }, // Hooked index
    'y': { thumb: 0.0, index: 1.5, middle: 1.5, ring: 1.5, pinky: 0.0 }, // Hang loose
    'z': { thumb: 1.2, index: 0.0, middle: 1.5, ring: 1.5, pinky: 1.5 }, // Pointing (Z trace)

    // Numbers 0-9
    '0': { thumb: 1.2, index: 1.2, middle: 1.2, ring: 1.2, pinky: 1.2 }, // O shape (same as letter O)
    '1': { thumb: 1.5, index: 0.0, middle: 1.5, ring: 1.5, pinky: 1.5 }, // Index up
    '2': { thumb: 1.5, index: 0.0, middle: 0.0, ring: 1.5, pinky: 1.5 }, // Peace/V sign
    '3': { thumb: 0.0, index: 0.0, middle: 0.0, ring: 1.5, pinky: 1.5 }, // Thumb + index + middle
    '4': { thumb: 1.5, index: 0.0, middle: 0.0, ring: 0.0, pinky: 0.0 }, // Four fingers up, thumb tucked
    '5': { thumb: 0.0, index: 0.0, middle: 0.0, ring: 0.0, pinky: 0.0 }, // All five open
    '6': { thumb: 0.0, index: 1.5, middle: 1.5, ring: 1.5, pinky: 0.0 }, // Thumb + pinky (like Y but different orientation)
    '7': { thumb: 0.0, index: 1.5, middle: 1.5, ring: 0.0, pinky: 1.5 }, // Thumb + ring
    '8': { thumb: 0.0, index: 1.5, middle: 0.0, ring: 1.5, pinky: 1.5 }, // Thumb + middle
    '9': { thumb: 0.0, index: 0.8, middle: 1.5, ring: 1.5, pinky: 1.5 }, // Thumb + bent index
};
