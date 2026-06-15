/**
 * Flight Crew Fitness - Core Engine
 * Unified and Cleaned for Production
 */

// Global Init Function - This is what your index.html calls
window.init = function() {
    console.log("FCF Engine Initializing...");
    
    // 1. Setup Listeners
    setupEventListeners();
    
    // 2. Initial UI Render
    generateWorkoutUI();
    
    console.log("FCF Engine Fully Operational.");
};

// --- Event Listeners ---
function setupEventListeners() {
    const hoursInput = document.getElementById('blockHours');
    const waterInput = document.getElementById('waterCleared');
    
    // Use optional chaining/null checks so we don't crash if elements are missing
    if (hoursInput) hoursInput.addEventListener('input', calculateHydration);
    if (waterInput) waterInput.addEventListener('input', calculateHydration);
    
    const fatigueToggle = document.getElementById('fatigueToggle');
    if (fatigueToggle) fatigueToggle.addEventListener('change', generateWorkoutUI);
}

// --- Hydration Logic ---
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

// --- Workout Engine ---
const pilotProtocolStretches = [
    { name: "Kneeling Hip Flexor + Reach", reps: "60s/side" },
    { name: "Thoracic Book Openers", reps: "10/side" },
    { name: "Glute Bridges", reps: "15 reps" }
];

const exerciseLibrary = [
    { id: "e1", name: "Goblet Squat", type: "weight", inRoom: false },
    { id: "e2", name: "DB Bench Press", type: "weight", inRoom: false },
    { id: "e3", name: "Standard Plank", type: "time", inRoom: true },
    { id: "e4", name: "Bodyweight Squat", type: "reps", inRoom: true }
];

function generateWorkoutUI() {
    const fatigueToggle = document.getElementById('fatigueToggle');
    const isFatigueMode = fatigueToggle ? fatigueToggle.checked : false;
    const container = document.getElementById('activeWorkoutUI');
    if (!container) return;

    let html = `<div class="bg-gray-800 p-5 rounded-xl border border-gray-700 mb-4">
        <h2 class="text-yellow-500 font-bold mb-2">🛫 Preflight</h2>`;
    pilotProtocolStretches.forEach(ex => {
        html += `<p class="text-sm text-white">${ex.name} <span class="text-gray-400">(${ex.reps})</span></p>`;
    });
    html += `</div>`;

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
