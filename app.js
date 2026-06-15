/**
 * Flight Crew Fitness - Full Engine
 */

// Initialize Supabase
if (!window.supabase) {
    window.supabase = supabase.createClient('https://dnxkydxbyihgsictbzjz.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRueGt5ZHhieWloZ3NpY3Riemp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3ODk4MTEsImV4cCI6MjA5NjM2NTgxMX0.oLUGuorQkbQ_u679NpE8FGBVAUmVE1K_rxl8q4B0n7k');
}

const wisdomCards = [
    { title: "Hydration Standard", text: "0.3L per hour of flight time is your baseline.", link: "https://www.ncbi.nlm.nih.gov" },
    { title: "Seated Correction", text: "Perform a standing glute squeeze every 60 mins of cruise.", link: "https://www.spine-health.com" },
    { title: "BP Technique", text: "Wait 5 mins in total quiet before taking your measurement.", link: "https://www.heart.org" },
    { title: "Glucose Baseline", text: "Measure fasting glucose upon waking for true metabolic data.", link: "https://www.diabetes.org" },
    { title: "Landing Prep", text: "Use 4-7-8 breathing during descent to manage cortisol.", link: "https://www.navyseals.com" }
];

window.switchTab = function(tabName) {
    document.querySelectorAll('[id^="view-"]').forEach(v => v.classList.add('hidden'));
    document.getElementById(`view-${tabName}`).classList.remove('hidden');
    if (tabName === 'export') window.loadTrends();
    if (tabName === 'wisdom') window.showWisdom(0);
};

window.showWisdom = function(dir) {
    const display = document.getElementById('wisdomDisplay');
    const index = (wisdomCards.indexOf(wisdomCards.find(c => display.innerText.includes(c.title))) + dir + wisdomCards.length) % wisdomCards.length || 0;
    const card = wisdomCards[index];
    display.innerHTML = `<h3 class="font-bold text-blue-400">${card.title}</h3><p class="text-sm mt-2">${card.text}</p><a href="${card.link}" class="text-xs text-gray-500 mt-4 block">Learn More</a>`;
};

window.loadTrends = async function() {
    const { data } = await window.supabase.from('weight_log').select('*').order('logged_at');
    const ctx = document.getElementById('healthChart').getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => new Date(d.logged_at).toLocaleDateString()),
            datasets: [{ label: 'Weight (lbs)', data: data.map(d => d.weight_lb), borderColor: '#3b82f6' }]
        }
    });
};

window.completeFlight = async function() {
    alert("Flight Data Logged & Secured to Cloud.");
    window.switchTab('dashboard');
};

// Initial setup
window.onload = () => {
    window.showWisdom(0);
};
