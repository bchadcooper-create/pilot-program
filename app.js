/**
 * Flight Crew Fitness - Core Engine
 * Handles UI state, Hydration math, Workout generation, and Postflight metrics.
 */

// --- 1. Hydration Payload Calculator ---
function calculateHydration() {
    const hours = parseFloat(document.getElementById('blockHours').value) || 0;
    const cleared = parseFloat(document.getElementById('waterCleared').value) || 0;
    
    // Formula: 3.0L base + 0.33L per flight hour
    const target = 3.0 + (hours * 0.33);
    const deficit = target - cleared;
    
    const resultBox = document.getElementById('hydrationResult');
    resultBox.classList.remove('hidden', 'bg-yellow-900', 'bg-red-900', 'bg-green-900');
    
    if (deficit <= 0) {
        resultBox.classList.add('bg-green-900', 'text-green-200');
        resultBox.innerHTML = `✅ <b>Hydration Optimal.</b> Target: ${target.toFixed(1)}L. Ready for duty.`;
    } else if (deficit > 2.0) {
        resultBox.classList.add('bg-red-900', 'text-red-200');
        resultBox.innerHTML = `⚠️ <b>Severe Deficit: ${deficit.toFixed(1)}L.</b> Target is ${target.toFixed(1)}L. Discs are compressing. Chug 1L before starting.`;
    } else {
        resultBox.classList.add('bg-yellow-900', 'text-yellow-200');
        resultBox.innerHTML = `⚠️ <b>Deficit: ${deficit.toFixed(1)}L.</b> Target is ${target.toFixed(1)}L. Sip water between sets.`;
    }
}

// --- 2. Pilot Protocol Stretches ---
const pilotProtocolStretches = [
    { name: "Kneeling Hip Flexor + Overhead Reach", reps: "60s per side", desc: "Opens psoas shortened by seated posture." },
    { name: "Thoracic Book Openers", reps: "10 per side", desc: "Restores mid-back rotation." },
    { name: "Glute Bridges (Pause at top)", reps: "15 reps", desc: "Fixes gluteal amnesia before lifting." }
];

const descentStretches = [
    { name: "Child’s Pose (Lat Bias)", reps: "2 mins", desc: "Decompresses lumbar spine." },
    { name: "Doorway Pec Stretch", reps: "60s per side", desc: "Reverses cockpit internal shoulder rotation." },
    { name: "90/90 Bed Breathing", reps: "3 mins", desc: "Legs on bed. Nasal breathing to power down CNS." }
];

// --- 3. Workout Logic Engine ---
const exerciseLibrary = [
    { id: "e1", name: "Goblet Squat", type: "weight", inRoom: false },
    { id: "e2", name: "Dumbbell Bench Press", type: "weight", inRoom: false },
    { id: "e3", name: "Standard Plank", type: "time", inRoom: true },
    { id: "e4", name: "Bodyweight Deep Squat", type: "reps", inRoom: true },
    { id: "e5", name: "Elevated Bed Pushups", type: "reps", inRoom: true },
    { id: "e6", name: "Dead Bug Hold", type: "time", inRoom: true }
];

function generateWorkoutUI() {
    const isFatigueMode = document.getElementById('fatigueToggle').checked;
    const container = document.getElementById('activeWorkoutUI');
    container.innerHTML = ''; 

    // Render Preflight
    let html = `<div class="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h2 class="text-lg font-bold text-yellow-500 mb-3 border-b border-gray-700 pb-2">🛫 Preflight (Mobilization)</h2>`;
    pilotProtocolStretches.forEach(ex => {
        html += `<div class="mb-3"><p class="font-semibold text-white">${ex.name} <span class="text-gray-400 text-sm ml-2">${ex.reps}</span></p><p class="text-xs text-gray-500">${ex.desc}</p></div>`;
    });
    html += `</div>`;

    // Render In-Flight (Main Block)
    html += `<div class="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h2 class="text-lg font-bold text-blue-500 mb-3 border-b border-gray-700 pb-2">✈️ In Flight (Main Block)</h2>`;
    
    const routine = isFatigueMode 
        ? exerciseLibrary.filter(e => e.inRoom) 
        : exerciseLibrary.filter(e => !e.inRoom).slice(0,2).concat(exerciseLibrary.find(e=>e.id==="e3"));
    
    routine.forEach((ex, i) => {
        html += `
        <div class="mb-4 bg-gray-900 p-3 rounded border border-gray-700">
            <p class="font-bold text-white mb-2">${ex.name}</p>
            <div class="flex space-x-2">
                <input type="number" id="weight_${i}" placeholder="${ex.type==='time'?'Seconds':'Weight'}" class="w-1/2 bg-gray-800 text-white rounded p-2 text-sm border border-gray-600 focus:border-blue-500 focus:outline-none">
                <input type="number" id="reps_${i}" placeholder="Reps/Sets" class="w-1/2 bg-gray-800 text-white rounded p-2 text-sm border border-gray-600 focus:border-blue-500 focus:outline-none">
            </div>
        </div>`;
    });
    html += `</div>`;

    // Render Descent
    html += `<div class="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h2 class="text-lg font-bold text-purple-500 mb-3 border-b border-gray-700 pb-2">🛬 Descent (Decompression)</h2>`;
    descentStretches.forEach(ex => {
        html += `<div class="mb-3"><p class="font-semibold text-white">${ex.name} <span class="text-gray-400 text-sm ml-2">${ex.reps}</span></p><p class="text-xs text-gray-500">${ex.desc}</p></div>`;
    });
    html += `</div>`;

    container.innerHTML = html;
    document.getElementById('completeFlightBtn').classList.remove('hidden');
}

// --- 4. Postflight Metrics (Calorie & Tonnage Engine) ---
function completeFlight() {
    const isFatigueMode = document.getElementById('fatigueToggle').checked;
    const bodyweightKg = 85; 
    const durationMinutes = 45; 
    
    const MET = isFatigueMode ? 3.5 : 5.0; 
    const calories = Math.round(durationMinutes * (MET * 3.5 * bodyweightKg) / 200);
    
    let tonnage = 0;
    const weightInputs = document.querySelectorAll('input[id^="weight_"]');
    const repInputs = document.querySelectorAll('input[id^="reps_"]');
    
    for(let i=0; i < weightInputs.length; i++) {
        let w = parseFloat(weightInputs[i].value) || 0;
        let r = parseFloat(repInputs[i].value) || 0;
        if(!isFatigueMode && w > 0) {
            tonnage += (w * r);
        }
    }

    document.getElementById('postCal').innerText = calories;
    document.getElementById('postTon').innerText = isFatigueMode ? "Bodyweight" : tonnage + " lbs";
    
    document.getElementById('takeoffBriefing').classList.add('hidden');
    document.getElementById('completeFlightBtn').classList.add('hidden');
    switchTab('postflight');
}
