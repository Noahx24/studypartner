// Footer year
document.getElementById('year').textContent = new Date().getFullYear();

// Waitlist forms — client-side only (no backend). Persists locally so the
// user sees confirmation if they revisit.
function wireSignup(formId, msgId) {
  const form = document.getElementById(formId);
  if (!form) return;
  const msg = document.getElementById(msgId);
  const input = form.querySelector('input[type="email"]');

  const stored = localStorage.getItem('sp_waitlist_email');
  if (stored) {
    input.value = stored;
    msg.textContent = "You're on the list — we'll email you at launch.";
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = (input.value || '').trim();
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    msg.classList.remove('is-error');

    if (!valid) {
      msg.textContent = 'Please enter a valid email address.';
      msg.classList.add('is-error');
      input.focus();
      return;
    }

    localStorage.setItem('sp_waitlist_email', value);
    msg.textContent = "You're in! We'll send your launch invite to " + value + '.';
    form.querySelector('button').textContent = 'Added ✓';
  });
}

wireSignup('notify', 'signupMsg');
wireSignup('notify2', 'signupMsg2');

// Scroll-reveal for sections (progressive enhancement)
const revealTargets = document.querySelectorAll('.section, .hero__art');
revealTargets.forEach((el) => el.classList.add('reveal'));

if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  revealTargets.forEach((el) => io.observe(el));
} else {
  revealTargets.forEach((el) => el.classList.add('is-in'));
}

// Animate the hero focus timer text for a touch of life
const ringEl = document.querySelector('.phone--hero .ring');
if (ringEl) {
  let p = 0;
  const target = 62;
  const span = ringEl.querySelector('span');
  const tick = () => {
    if (p >= target) return;
    p += 1;
    ringEl.style.setProperty('--p', p);
    span.textContent = p + '%';
    requestAnimationFrame(tick);
  };
  setTimeout(() => requestAnimationFrame(tick), 400);
}
