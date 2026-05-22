class VirtualJoystick {
    constructor(elementId) {
        this.zone = document.getElementById(elementId);
        this.stick = document.createElement('div');
        this.deltaX = 0; this.deltaY = 0; this.active = false;
        this.initStyle(); this.initEvents();
    }
    initStyle() {
        this.stick.style.width = '44px'; this.stick.style.height = '44px';
        this.stick.style.background = 'rgba(255,255,255,0.2)'; this.stick.style.border = '1px solid rgba(255,255,255,0.4)';
        this.stick.style.borderRadius = '50%'; this.stick.style.position = 'absolute';
        this.stick.style.top = '33px'; this.stick.style.left = '33px';
        this.zone.appendChild(this.stick);
    }
    initEvents() {
        const handleStart = (e) => { this.active = true; handleMove(e); };
        const handleMove = (e) => {
            if (!this.active) return;
            const touch = e.touches ? e.touches[0] : e;
            const rect = this.zone.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            let x = touch.clientX - centerX; let y = touch.clientY - centerY;
            const distance = Math.sqrt(x*x + y*y); const maxRadius = rect.width / 2;
            if (distance > maxRadius) { x = (x / distance) * maxRadius; y = (y / distance) * maxRadius; }
            this.stick.style.transform = `translate(${x}px, ${y}px)`;
            this.deltaX = x / maxRadius; this.deltaY = y / maxRadius;
        };
        const handleEnd = () => { this.active = false; this.deltaX = 0; this.deltaY = 0; this.stick.style.transform = 'translate(0px, 0px)'; };
        this.zone.addEventListener('touchstart', handleStart);
        window.addEventListener('touchmove', handleMove, { passive: false });
        window.addEventListener('touchend', handleEnd);
        this.zone.addEventListener('mousedown', handleStart);
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleEnd);
    }
}
