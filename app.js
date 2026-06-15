/**
 * Flight Crew Fitness - Master SOP Engine
 */

window.supabase = supabase.createClient('https://dnxkydxbyihgsictbzjz.supabase.co', 'YOUR_KEY_HERE');

// 50-Card Wisdom Library
const wisdomCards = [
    { title: "Hydration SOP", text: "0.3L/hr flight time baseline.", link: "#" },
    { title: "Seated Correction", text: "Glute squeeze every 60 mins.", link: "#" },
    { title: "Landing Prep", text: "Use 4-7-8 breathing on approach.", link: "#" },
    // Expand to 50 entries here...
];

let currentWisdom = 0;

window.switchTab = (tab) => {
    document.querySelectorAll('[id^="view-"]').forEach(v => v.classList.add('hidden'));
    document.getElementById(`view-${tab}`).classList.remove('hidden');
    if(tab === 'wisdom') window.showWisdom(0);
};

window.showWisdom = (dir) => {
    currentWisdom = (currentWisdom + dir + wisdomCards.length) % wisdomCards.length;
    const card = wisdomCards[currentWisdom];
    document.getElementById('wisdomDisplay').innerHTML = `
        <h3 class="font-bold text-blue-400">${card.title}</h3>
        <p class="text-sm mt-3">${card.text}</p>
        <a href="${card.link}" class="text-xs text-gray-500 mt-4 block underline">Deep Dive</a>
    `;
};

window.startMission = () => {
    const env = document.getElementById('gymEnv').value;
    const container = document.getElementById('activeWorkoutUI');
    container.innerHTML = ''; // Reset
    
    // Logic: filter exercises by env, then generate UI
    window.switchTab('workout');
};

window.saveBiometrics = async () => {
    const weight = document.getElementById('weightLog').value;
    await window.supabase.from('weight_log').insert([{ weight_lb: weight }]);
    alert("Biometrics Recorded.");
};

window.onload = () => window.showWisdom(0);
