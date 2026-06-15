/**
 * Flight Crew Fitness - Core Engine
 * Manages UI rendering, hydration, and workout logic.
 */

/**
 * Flight Crew Fitness - Core Engine
 */

// Define init globally so index.html can find it
window.init = function() {
    console.log("FCF Engine Initialized.");
    // This connects to the <div id="app"> in your index.html
    const app = document.getElementById('app');
    if (app) {
        app.innerHTML = '<h1>Flight Crew Fitness</h1><p>System Operational.</p>';
        // Here you would call your UI rendering functions
    }
};

// Ensure app.js logic is fully loaded
console.log("app.js loaded successfully.");

// --- 1. Initialization ---
function init() {
    console.log("FCF Engine Initializing...");
    // Bind event listeners
    setupEventListeners();
    // Default render
    generateWorkoutUI();
}

// --- 2. Event Listeners ---
function setupEventListeners() {
    // Listen for hydration inputs
    const hoursInput = document.getElementById('blockHours');
    const waterInput = document.getElementById('waterCleared');
    if (hoursInput) hoursInput.addEventListener('input', calculateHydration);
    if (waterInput) waterInput.addEventListener('input', calculateHydration);
}

// --- 3. Hydration Logic ---
function calculateHydration() {
    const hours = parseFloat(document.getElementById('blockHours')?.value) || 0;
    const cleared = parseFloat(document.getElementById('waterCleared')?.value) || 0;
    const target = 3.0 + (hours * 0.33);
    const deficit = target - cleared;
    
    const resultBox = document.getElementById('hydrationResult');
    if (!resultBox) return;

    resultBox.classList.remove('hidden', 'bg-yellow-900', 'bg-red-900', 'bg-green-900');
    if (deficit <= 0) {
        resultBox.classList.add('bg-green-900', 'text-green-200');
        resultBox.innerHTML = `✅ <b>Hydration Optimal.</b> Ready for duty.`;
    } else if (deficit > 2.0) {
        resultBox.classList.add('bg-red-900', 'text-red-200');
        resultBox.innerHTML = `⚠️ <b>Deficit: ${deficit.toFixed(1)}L.</b> Chug 1L before starting.`;
    } else {
        resultBox.classList.add('bg-yellow-900', 'text-yellow-200');
        resultBox.innerHTML = `⚠️ <b>Deficit: ${deficit.toFixed(1)}L.</b> Sip water between sets.`;
    }
}

// --- 4. Pilot Protocol Data ---
const pilotProtocolStretches = [
    { name: "Kneeling Hip Flexor + Overhead Reach", reps: "60s/side", desc: "Opens psoas." },
    { name: "Thoracic Book Openers", reps: "10/side", desc: "Restores rotation." },
    { name: "Glute Bridges", reps: "15 reps", desc: "Activates glutes." }
];

const descentStretches = [
    { name: "Child’s Pose (Lat Bias)", reps: "2m", desc: "Lumbar decompression." },
    { name: "Doorway Pec Stretch", reps: "60s/side", desc: "Reverses cockpit posture." },
    { name: "90/90 Bed Breathing", reps: "3m", desc: "CNS down-regulation." }
];

const exerciseLibrary = [
    { id: "e1", name: "Goblet Squat", type: "weight", inRoom: false },
    { id: "e2", name: "DB Bench Press", type: "weight", inRoom: false },
    { id: "e3", name: "Standard Plank", type: "time", inRoom: true },
    { id: "e4", name: "Bodyweight Squat", type: "reps", inRoom: true },
    { id: "e5", name: "Elevated Pushups", type: "reps", inRoom: true },
    { id: "e6", name: "Dead Bug", type: "time", inRoom: true }
];

// --- 5. Workout UI Engine ---
function generateWorkoutUI() {
    const fatigueToggle = document.getElementById('fatigueToggle');
    const isFatigueMode = fatigueToggle ? fatigueToggle.checked : false;
    const container = document.getElementById('activeWorkoutUI');
    if (!container) return;

    let html = `<div class="bg-gray-800 p-5 rounded-xl border border-gray-700">
        <h2 class="text-yellow-500 font-bold mb-2">🛫 Preflight</h2>`;
    pilotProtocolStretches.forEach(ex => {
        html += `<p class="text-sm text-white">${ex.name} <span class="text-gray-400">(${ex.reps})</span></p>`;
    });
    html += `</div>`;

    // Main Block
    html += `<div class="bg-gray-800 p-5 rounded-xl border border-gray-700">
        <h2 class="text-blue-500 font-bold mb-2">✈️ In Flight</h2>`;
    const routine = isFatigueMode 
        ? exerciseLibrary.filter(e => e.inRoom) 
        : exerciseLibrary.filter(e => !e.inRoom);
    
    routine.forEach((ex, i) => {
        html += `<div class="mb-3">
            <p class="font-bold text-white">${ex.name}</p>
            <input type="number" placeholder="Sets/Reps" class="w-full bg-gray-900 p-2 rounded border border-gray-600 text-sm">
        </div>`;
    });
    html += `</div>`;

    container.innerHTML = html;
}

// --- 6. Postflight ---
function completeFlight() {
    // Logic for calorie/tonnage calc remains here
    alert("Flight Data Recorded.");
}
