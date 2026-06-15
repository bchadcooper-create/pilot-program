// --- Initialize Supabase ---
window.supabase = supabase.createClient('https://dnxkydxbyihgsictbzjz.supabase.co', 'YOUR_PUBLIC_ANON_KEY');

// --- 50 Wisdom Cards ---
const wisdomCards = [
    { title: "Hydration SOP", text: "0.3L/hr flight time baseline.", link: "#" },
    { title: "Seated Correction", text: "Glute squeeze every 60 mins.", link: "#" },
    { title: "Landing Prep", text: "Use 4-7-8 breathing on approach.", link: "#" },
    { title: "BP Accuracy", text: "Wait 5 mins in quiet before measuring.", link: "#" },
    { title: "Glucose Baseline", text: "Measure fasting glucose upon waking.", link: "#" },
    // ... [Add items 6-50 here in this same pattern]
    { title: "Flare Focus", text: "Calm the CNS before the flare.", link: "#" }
];

let currentWisdom = 0;

// --- Tab Logic ---
window.switchTab = (tab) => {
    document.querySelectorAll('[id^="view-"]').forEach(v => v.classList.add('hidden'));
    document.getElementById(`view-${tab}`).classList.remove('hidden');
    if(tab === 'export') window.loadTrends();
    if(tab === 'wisdom') window.showWisdom(0);
};

// --- Wisdom Carousel ---
window.showWisdom = (dir) => {
    currentWisdom = (currentWisdom + dir + wisdomCards.length) % wisdomCards.length;
    const card = wisdomCards[currentWisdom];
    document.getElementById('wisdomDisplay').innerHTML = `
        <h3 class="font-bold text-blue-400 text-lg">${card.title}</h3>
        <p class="mt-4">${card.text}</p>
        <a href="${card.link}" class="block mt-6 text-xs underline text-gray-500">Read More</a>
    `;
};

// --- Workout Engine ---
window.startMission = () => {
    const env = document.getElementById('gymEnv').value;
    const container = document.getElementById('activeWorkoutUI');
    container.innerHTML = `<h2 class="text-white font-bold">Today's Protocol (${env.toUpperCase()})</h2>
                           <p class="text-gray-400 text-sm">Follow prescribed intensity.</p>`;
    window.switchTab('workout');
};

// --- Persistence ---
window.completeFlight = async () => {
    await window.supabase.from('workout_sessions').insert([{
        session_data: { date: new Date().toISOString(), status: 'Completed' }
    }]);
    alert("Flight Secured.");
    window.switchTab('dashboard');
};

window.saveBiometrics = async () => {
    await window.supabase.from('weight_log').insert([{
        weight_lb: document.getElementById('weightLog').value,
        systolic_bp: document.getElementById('bpLog').value,
        fasting_glucose: document.getElementById('glucoseLog').value
    }]);
    alert("Biometrics Recorded.");
};

window.loadTrends = async () => {
    const { data } = await window.supabase.from('weight_log').select('*');
    const ctx = document.getElementById('healthChart').getContext('2d');
    new Chart(ctx, { type: 'line', data: { labels: data.map(d=>d.logged_at), datasets: [{ data: data.map(d=>d.weight_lb), label: 'Weight' }] }});
};

window.onload = () => window.showWisdom(0);
