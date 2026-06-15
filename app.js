/**
 * Flight Crew Fitness - Core Engine
 * Manages UI rendering, hydration, workout logic, and Supabase persistence.
 */

// --- 1. Supabase Initialization ---
const SUPABASE_URL = 'https://dnxkydxbyihgsictbzjz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRueGt5ZHhieWloZ3NpY3Riemp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3ODk4MTEsImV4cCI6MjA5NjM2NTgxMX0.oLUGuorQkbQ_u679NpE8FGBVAUmVE1K_rxl8q4B0n7k';

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- 2. Global Initialization ---
window.init = function() {
    console.log("FCF Engine Initialized.");
    setupEventListeners();
    generateWorkoutUI();
};

function setupEventListeners() {
    const hoursInput = document.getElementById('blockHours');
    const waterInput = document.getElementById('waterCleared');
    const fatigueToggle = document.getElementById('fatigueToggle');
    
    if (hoursInput) hoursInput.addEventListener('input', calculateHydration);
    if (waterInput) waterInput.addEventListener('input', calculateHydration);
    if (fatigueToggle) fatigueToggle.addEventListener('change', generateWorkoutUI);
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

// --- 4. Workout Engine ---
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
            <input type="number" id="weight_${i}" placeholder="Weight" class="w-full bg-gray-900 p-2 rounded border border-gray-600 text-sm mb-1">
            <input type="number" id="reps_${i}" placeholder="Reps" class="w-full bg-gray-900 p-2 rounded border border-gray-600 text-sm">
        </div>`;
    });
    html += `</div>`;

    container.innerHTML = html;
}

// --- 5. Data Persistence Engine ---
async function completeFlight() {
    const isFatigueMode = document.getElementById('fatigueToggle').checked;
    
    // Calculate Metrics
    const bodyweightKg = 85; 
    const MET = isFatigueMode ? 3.5 : 5.0; 
    const calories = Math.round(45 * (MET * 3.5 * bodyweightKg) / 200);
    
    let tonnage = 0;
    document.querySelectorAll('input[id^="weight_"]').forEach((wIn, i) => {
        let rIn = document.getElementById(`reps_${i}`);
        tonnage += (parseFloat(wIn.value) || 0) * (parseFloat(rIn?.value) || 0);
    });

    // Update UI Summary
    document.getElementById('postCal').innerText = calories;
    document.getElementById('postTon').innerText = isFatigueMode ? "Bodyweight" : tonnage + " lbs";

    // Push to Supabase
    try {
        await supabase.from('workout_sessions').insert([{
            session_data: { calories, tonnage, fatigueMode: isFatigueMode, date: new Date().toISOString() },
            workout_key: 'session_' + Date.now()
        }]);
        console.log("Flight Secured in Cloud.");
    } catch (err) {
        console.error("Cloud Sync Failed:", err);
    }

    document.getElementById('takeoffBriefing').classList.add('hidden');
    document.getElementById('completeFlightBtn').classList.add('hidden');
    switchTab('postflight');
}
