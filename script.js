// Footer year
document.getElementById('year').textContent = new Date().getFullYear();

// Email signup: validate, then open mail client pre-filled with the user's address
function wireSignup(formId, msgId) {
  const form = document.getElementById(formId);
  if (!form) return;
  const msg = document.getElementById(msgId);
  const input = form.querySelector('input[type="email"]');
  const btn = form.querySelector('button[type="submit"]');

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

    const subject = encodeURIComponent('StudyPartner Early Access');
    const body = encodeURIComponent(
      'Hi,\n\nI\'d like early access to StudyPartner.\n\nMy email: ' + value
    );
    window.location.href =
      'mailto:contact@sibahledigital.co.za?subject=' + subject + '&body=' + body;

    msg.textContent = 'Opening your email app. We\'ll be in touch!';
    btn.textContent = 'Sent ✓';
    btn.disabled = true;
  });
}

wireSignup('notify', 'signupMsg');
wireSignup('notify2', 'signupMsg2');

// Scroll-reveal for the second section only (hero is immediately visible)
const revealTargets = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08 }
  );
  revealTargets.forEach((el) => io.observe(el));
} else {
  revealTargets.forEach((el) => el.classList.add('is-in'));
}
