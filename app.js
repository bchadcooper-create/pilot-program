/**
 * Flight Crew Fitness - Full Operational Engine
 * Version: 1.0 (Production)
 */

// Initialize Supabase Client
window.supabase = supabase.createClient('https://dnxkydxbyihgsictbzjz.supabase.co', 'YOUR_PUBLIC_ANON_KEY');

// 50-Card Wisdom Library
const wisdomCards = [
    { title: "Hydration SOP", text: "0.3L/hr flight time baseline.", link: "#" },
    { title: "Seated Correction", text: "Glute squeeze every 60 mins.", link: "#" },
    { title: "Landing Prep", text: "Use 4-7-8 breathing on approach.", link: "#" },
    { title: "BP Accuracy", text: "Wait 5 mins in quiet before measuring.", link: "#" },
    { title: "Glucose Baseline", text: "Measure fasting glucose upon waking.", link: "#" },
    { title: "Blue Light", text: "Block blue light 90 mins before bed.", link: "#" },
    { title: "The Why", text: "Squats fix posture; they aren't just for legs.", link: "#" },
    { title: "Walk Benefit", text: "10 mins post-meal blunts glucose spikes.", link: "#" },
    { title: "Sleep Health", text: "Consistency in wake time beats duration.", link: "#" },
    { title: "Stress Relief", text: "Box breathing reset for the cockpit.", link: "#" },
    { title: "Protein Priority", text: "Aim for 30g at each meal for satiety.", link: "#" },
    { title: "Fiber Intake", text: "30g daily keeps metabolic health stable.", link: "#" },
    { title: "Zone 2 Training", text: "Keep steady-state cardio easy and conversational.", link: "#" },
    { title: "Mobility Focus", text: "Thoracic extension is critical for pilots.", link: "#" },
    { title: "Caffeine Cutoff", text: "Stop intake 8 hours before bedtime.", link: "#" },
    { title: "Sun Exposure", text: "Morning light sets your circadian rhythm.", link: "#" },
    { title: "Strength Baseline", text: "Focus on 3 core lifts: Push, Pull, Squat.", link: "#" },
    { title: "Active Recovery", text: "Movement beats static sitting on layovers.", link: "#" },
    { title: "Waist Standard", text: "Measure at the umbilicus, end of exhale.", link: "#" },
    { title: "Meal Timing", text: "Finish final meal 3 hours before sleep.", link: "#" },
    { title: "CNS Recovery", text: "Rest days are when strength happens.", link: "#" },
    { title: "Posture Cue", text: "Shoulders back and down, not forward.", link: "#" },
    { title: "Decompression", text: "Use yoga child's pose to stretch the lumbar.", link: "#" },
    { title: "Glucose Spikes", text: "Avoid refined sugar; focus on whole foods.", link: "#" },
    { title: "Hydration Status", text: "Check urine color—aim for pale straw.", link: "#" },
    { title: "Cold Exposure", text: "Short showers at end of bath boost alertness.", link: "#" },
    { title: "Mindfulness", text: "2 mins meditation clears flight decision fatigue.", link: "#" },
    { title: "Joint Longevity", text: "Control the tempo of every repetition.", link: "#" },
    { title: "Blood Pressure", text: "Reduce sodium, increase leafy greens.", link: "#" },
    { title: "Core Stability", text: "Planks protect your spine during taxi.", link: "#" },
    { title: "Mental Focus", text: "Remove phone distractions 1 hour before sleep.", link: "#" },
    { title: "Dynamic Warmup", text: "Move through full range before heavy lifting.", link: "#" },
    { title: "Metabolic Health", text: "Muscle mass is your metabolic insurance.", link: "#" },
    { title: "Tension Relief", text: "Massage traps/neck after landing.", link: "#" },
    { title: "Weight Consistency", text: "Same scale, same time, daily trend.", link: "#" },
    { title: "Vitamin D", text: "Crucial for pilots who fly at night.", link: "#" },
    { title: "Aerobic Base", text: "Build it slow; keep heart rate low.", link: "#" },
    { title: "Posture Correction", text: "Chin tucks reverse 'pilot neck'.", link: "#" },
    { title: "Training Volume", text: "Progressive overload is key to progress.", link: "#" },
    { title: "Cognitive Load", text: "Hydration is your #1 mental tool.", link: "#" },
    { title: "Fasting Benefits", text: "Gives your digestive system a break.", link: "#" },
    { title: "Posture Reset", text: "Hinge at hips, not the lower back.", link: "#" },
    { title: "Post-Flight Snack", text: "Focus on protein and electrolytes.", link: "#" },
    { title: "Breathing SOP", text: "Nasal breathing regulates O2 uptake.", link: "#" },
    { title: "The Flare", text: "Physical readiness enables mental focus.", link: "#" },
    { title: "Sleep Strategy", text: "Darkness is non-negotiable for recovery.", link: "#" },
    { title: "Flexibility", text: "Consistency > Intensity for mobility.", link: "#" },
    { title: "Strength Metric", text: "Track weight lifted over time.", link: "#" },
    { title: "Recovery Metric", text: "Monitor resting heart rate changes.", link: "#" },
    { title: "Final SOP", text: "Continuous improvement is the goal.", link: "#" }
];

let currentWisdom = 0;

// --- Tab Navigation Engine ---
window.switchTab = (tab) => {
    document.querySelectorAll('[id^="view-"]').forEach(v => v.classList.add('hidden'));
    document.getElementById(`view-${tab}`).classList.remove('hidden');
    if (tab === 'export') window.loadTrends();
    if (tab === 'wisdom') window.showWisdom(0);
};

// --- Wisdom Module ---
window.showWisdom = (dir) => {
    currentWisdom = (currentWisdom + dir + wisdomCards.length) % wisdomCards.length;
    const card = wisdomCards[currentWisdom];
    const display = document.getElementById('wisdomDisplay');
    if (display) {
        display.innerHTML = `
            <h3 class="font-bold text-blue-400 text-lg">${card.title}</h3>
            <p class="mt-4">${card.text}</p>
            <a href="${card.link}" class="block mt-6 text-xs underline text-gray-500">Read More</a>
        `;
    }
};

// --- Workout Logic ---
window.startMission = () => {
    const env = document.getElementById('gymEnv').value;
    const container = document.getElementById('activeWorkoutUI');
    container.innerHTML = `
        <h2 class="text-white font-bold text-lg">Mission Profile: ${env.toUpperCase()}</h2>
        <div class="space-y-4">
            <p class="text-gray-400 text-sm">Follow the prescribed sets and intensity for today's environment.</p>
        </div>
    `;
    window.switchTab('workout');
};

// --- Data Persistence Engine ---
window.completeFlight = async () => {
    const { error } = await window.supabase.from('workout_sessions').insert([{
        session_data: { 
            date: new Date().toISOString(), 
            status: 'Completed' 
        }
    }]);
    if (error) {
        console.error("Cloud Sync Failed", error);
        alert("Persistence Error. Check connection.");
    } else {
        alert("Flight Secured.");
        window.switchTab('dashboard');
    }
};

window.saveBiometrics = async () => {
    const { error } = await window.supabase.from('weight_log').insert([{
        weight_lb: document.getElementById('weightLog').value,
        systolic_bp: document.getElementById('bpLog').value,
        fasting_glucose: document.getElementById('glucoseLog').value
    }]);
    if (error) alert("Error recording biometrics.");
    else alert("Biometrics Recorded.");
};

window.loadTrends = async () => {
    const { data } = await window.supabase.from('weight_log').select('*');
    const ctx = document.getElementById('healthChart')?.getContext('2d');
    if (ctx && data) {
        new Chart(ctx, { 
            type: 'line', 
            data: { 
                labels: data.map(d => new Date(d.logged_at).toLocaleDateString()), 
                datasets: [{ 
                    data: data.map(d => d.weight_lb), 
                    label: 'Weight (lbs)',
                    borderColor: '#3b82f6'
                }] 
            }
        });
    }
};

// Init
window.onload = () => {
    window.showWisdom(0);
};
