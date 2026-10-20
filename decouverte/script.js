const bouton = document.getElementById("bouton");
const chien = document.getElementById("chien");

const teteChien = document.querySelector(".tete");
const animaux = ["🐶", "🐱", "🐰", "🐼", "🦊", "🐸", "🐵", "🦁"];
let numeroAnimal = 0;

bouton.addEventListener("click", function () {
  chien.hidden = !chien.hidden;
  numeroAnimal = (numeroAnimal + 1) % animaux.length;
  teteChien.textContent = animaux[numeroAnimal];
});

const boutonPerso = document.getElementById("personnage");
const perso = document.getElementById("perso");
const tetePerso = document.querySelector(".perso-tete");
const visages = ["😎", "😀", "🤩", "😜", "🥳", "🤓", "😺", "🤠"];
let numeroVisage = 0;

boutonPerso.addEventListener("click", function () {
  perso.hidden = !perso.hidden;
  numeroVisage = (numeroVisage + 1) % visages.length;
  tetePerso.textContent = visages[numeroVisage];
});

const boutonCouleur = document.getElementById("couleur");

boutonCouleur.addEventListener("click", function () {
  const teinte = Math.floor(Math.random() * 360);
  document.body.style.backgroundColor = "hsl(" + teinte + ", 80%, 45%)";
});

// Musique 67 : un rythme (grosse caisse + charleston), une basse
// et une mélodie de 6 notes puis 7 notes, en boucle.
const boutonMusique = document.getElementById("musique");
const melodie = [
  262, 294, 330, 392, 330, 294,
  523, 494, 440, 392, 440, 494, 523
];
const basse = [65, 65, 98, 87];
let son = null;
let minuteur = null;
let temps = 0;

function jouerNote(frequence, type, duree, force) {
  const oscillateur = son.createOscillator();
  const volume = son.createGain();
  oscillateur.type = type;
  oscillateur.frequency.value = frequence;
  volume.gain.setValueAtTime(force, son.currentTime);
  volume.gain.exponentialRampToValueAtTime(0.001, son.currentTime + duree);
  oscillateur.connect(volume);
  volume.connect(son.destination);
  oscillateur.start();
  oscillateur.stop(son.currentTime + duree);
}

function grosseCaisse() {
  const oscillateur = son.createOscillator();
  const volume = son.createGain();
  oscillateur.frequency.setValueAtTime(150, son.currentTime);
  oscillateur.frequency.exponentialRampToValueAtTime(40, son.currentTime + 0.15);
  volume.gain.setValueAtTime(0.5, son.currentTime);
  volume.gain.exponentialRampToValueAtTime(0.001, son.currentTime + 0.2);
  oscillateur.connect(volume);
  volume.connect(son.destination);
  oscillateur.start();
  oscillateur.stop(son.currentTime + 0.2);
}

function charleston() {
  const taille = Math.floor(son.sampleRate * 0.05);
  const tampon = son.createBuffer(1, taille, son.sampleRate);
  const donnees = tampon.getChannelData(0);
  for (let i = 0; i < taille; i++) {
    donnees[i] = Math.random() * 2 - 1;
  }
  const bruit = son.createBufferSource();
  const volume = son.createGain();
  bruit.buffer = tampon;
  volume.gain.setValueAtTime(0.12, son.currentTime);
  volume.gain.exponentialRampToValueAtTime(0.001, son.currentTime + 0.05);
  bruit.connect(volume);
  volume.connect(son.destination);
  bruit.start();
}

function unTemps() {
  if (temps % 4 === 0) {
    grosseCaisse();
    jouerNote(basse[(temps / 4) % basse.length], "sawtooth", 0.4, 0.15);
  }
  if (temps % 2 === 1) {
    charleston();
  }
  jouerNote(melodie[temps % melodie.length], "square", 0.18, 0.08);
  temps++;
}

boutonMusique.addEventListener("click", function () {
  if (minuteur) {
    clearInterval(minuteur);
    minuteur = null;
    boutonMusique.textContent = "Musique 67";
    return;
  }
  if (!son) {
    son = new AudioContext();
  }
  temps = 0;
  minuteur = setInterval(unTemps, 180);
  boutonMusique.textContent = "Stop musique";
});
