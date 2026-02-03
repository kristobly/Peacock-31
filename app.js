const newRoundBtn = document.getElementById('new-round-btn');
const status = document.getElementById('status');

newRoundBtn.addEventListener('click', () => {
    const timestamp = new Date().toLocaleTimeString();
    status.textContent = `New round started at ${timestamp}`;
    console.log('New round');
});
