// =============================================
//  CRISISGRID - script.js
// =============================================

// 🔥 Firebase Setup
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { 
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


const firebaseConfig = {
  apiKey: "AIzaSyB6QdyAXSWkyJZxYZ-FmYodEf_CY-PsVik",
  authDomain: "crisisgrid-36a3d.firebaseapp.com",
  projectId: "crisisgrid-36a3d",
  storageBucket: "crisisgrid-36a3d.firebasestorage.app",
  messagingSenderId: "1002066303670",
  appId: "1:1002066303670:web:f761b2960aa90c067ba417"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 🔗 Connect to YOUR existing system
window.firebaseIntegration = {
  enabled: true,

  async login({ email, password }) {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    
    // Check role in Firestore
    const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
    if (userDoc.exists() && userDoc.data().role === 'admin') {
      window.location.href = "admin.html";
    } else {
      window.location.href = "dashboard.html";
    }
    showToast("Login successful", "success");
  },

  async signup({ name, email, phone, password }) {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);

    // Save user to Firestore users collection
    await setDoc(doc(db, 'users', userCredential.user.uid), {
      displayName: name,
      email:       email,
      phone:       phone,
      role:        'user',
      banned:      false,
      createdAt:   new Date(),
    });

    await sendEmailVerification(userCredential.user);
    showToast("Verification email sent 📩", "success");
  },

  // 🔥 Google login (unchanged working version)
  async socialLogin({ provider }) {
    try {
      if (provider === "Google") {
        const googleProvider = new GoogleAuthProvider();

        googleProvider.setCustomParameters({
          prompt: "select_account"
        });

        const result = await signInWithPopup(auth, googleProvider);

        const user = result.user;
        console.log('Google user email:', user.email, 'displayName:', user.displayName);

const userRef = doc(db, 'users', user.uid);
const userSnap = await getDoc(userRef);
if (!userSnap.exists()) {
  await setDoc(userRef, {
  displayName: user.displayName || '',
  email: user.email || user.providerData?.[0]?.email || '',
  phone: window.currentUserData?.phone || '',
  role: userSnap.exists() ? userSnap.data().role : 'user',
  createdAt: userSnap.exists() ? userSnap.data().createdAt : new Date()
}, { merge: true });
} else {
  // Update email if empty
  if (!userSnap.data().email) {
    await setDoc(userRef, { email: user.email || '' }, { merge: true });
  }
}



 
        showToast("Google login successful", "success");

        setTimeout(() => {
          window.location.href = "dashboard.html";
        }, 1000);
      }
    } catch (error) {
      console.error(error);
      showToast(error.message, "error");
    }
  }
};

// ---- Tab Switcher ----
function switchTab(tab) {
  const loginForm = document.getElementById('form-login');
  const signupForm = document.getElementById('form-signup');
  const tabLogin = document.getElementById('tab-login');
  const tabSignup = document.getElementById('tab-signup');

  if (tab === 'login') {
    loginForm.classList.remove('hidden');
    signupForm.classList.add('hidden');
    tabLogin.classList.add('active');
    tabSignup.classList.remove('active');
  } else {
    signupForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    tabSignup.classList.add('active');
    tabLogin.classList.remove('active');
  }
}

// ---- Toast Notification ----
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// ---- Basic Validation ----
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getFirebaseIntegration() {
  return window.firebaseIntegration || {};
}

async function runFirebaseAction(actionName, payload) {
  const integration = getFirebaseIntegration();

  if (!integration.enabled || typeof integration[actionName] !== 'function') {
    return false;
  }

  await integration[actionName](payload);
  return true;
}

// ---- Login Handler ----
async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  if (!email) {
    showToast('Please enter your email address.', 'error');
    return;
  }
  if (!isValidEmail(email)) {
    showToast('Enter a valid email address.', 'error');
    return;
  }
  if (!password || password.length < 6) {
    showToast('Password must be at least 6 characters.', 'error');
    return;
  }

  try {
    const handledByFirebase = await runFirebaseAction('login', { email, password });
    if (handledByFirebase) return;
  } catch (error) {
    showToast(error.message || 'Login failed.', 'error');
  }
}

// ---- Signup Handler ----
async function handleSignup() {
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const phone = document.getElementById('signup-phone').value.trim();
  const password = document.getElementById('signup-password').value;

  if (!name) {
    showToast('Please enter your full name.', 'error');
    return;
  }
  if (!email || !isValidEmail(email)) {
    showToast('Enter a valid email address.', 'error');
    return;
  }
  if (!phone || phone.length < 10) {
    showToast('Enter a valid mobile number.', 'error');
    return;
  }
  if (!password || password.length < 6) {
    showToast('Password must be at least 6 characters.', 'error');
    return;
  }

  try {
    const handledByFirebase = await runFirebaseAction('signup', {
      name, email, phone, password
    });

    if (handledByFirebase) return;

  } catch (error) {
    showToast(error.message || 'Signup failed.', 'error');
  }
}

// ---- Social Auth Handler ----
async function handleSocial(provider) {
  try {
    const handledByFirebase = await runFirebaseAction('socialLogin', { provider });
    if (handledByFirebase) return;
  } catch (error) {
    showToast(error.message || `${provider} failed.`, 'error');
  }
}

// ---- Enter Key Support ----
document.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') {
    const loginVisible = !document.getElementById('form-login').classList.contains('hidden');
    const signupVisible = !document.getElementById('form-signup').classList.contains('hidden');

    if (loginVisible) handleLogin();
    if (signupVisible) handleSignup();
  }
});

window.handleSignup = handleSignup;
window.handleLogin = handleLogin;
window.handleSocial = handleSocial;
window.switchTab = switchTab;

