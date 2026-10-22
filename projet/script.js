const canvas = document.getElementById("jeu");
let ctx = canvas.getContext("2d"); // change un instant pour dessiner les aperçus de la boutique
const infos = document.getElementById("infos");

const SOL = 560; // ligne du bas où marchent le héros et les zombies

const joueur = { x: 235, largeur: 30, vitesse: 5 };
let balles = [];
let zombies = [];
let score = 0;
let zombiesTues = 0;
const boutonRejouer = document.getElementById("rejouer");

// Record : le plus grand nombre de zombies battus (gardé dans le navigateur)
let record = 0;
try {
  record = Number(localStorage.getItem("recordZombies")) || 0;
} catch (e) {}
let vies = 30;
let armes = [];          // armes qui tombent sur le chemin
let niveauArme = 0;      // position dans la liste ARMES
let prochaineArme = 600;
let recharge = 0;
// Chaque arme est meilleure que la précédente
const ARMES = [
  { nom: "Pistolet", balles: 1, cadence: 0 },
  { nom: "Double pistolet", balles: 2, cadence: 0 },
  { nom: "AK-47", balles: 3, cadence: 14 },       // reste appuyé sur espace
  { nom: "Mitraillette", balles: 3, cadence: 6 }  // tir très rapide
];
let flashRouge = 0; // effet rouge quand le héros est touché
let vague = 0;
let zombiesAApparaitre = 0;
let pause = 0; // petite pause entre deux vagues
let prochainZombie = 0;
let finDuJeu = false;
let enAttente = true; // vrai tant qu'on n'a pas cliqué sur Jouer
let niveau = 1;       // on passe au niveau suivant après la vague 45
let victoire = false; // vrai quand le niveau est terminé
let enPause = false;  // vrai quand on a cliqué sur Pause
let animNiveau = 0;   // temps restant de l'animation de début de niveau
let animManoir = 0;   // temps restant de la scène d'entrée dans le manoir (vague 15)
let animMontee = 0;  // temps restant de l'anneau quand le héros monte de niveau
let confettis = [];   // confettis de la fin de niveau
const COULEURS_NIVEAU = ["#ffd400", "#4ac8ff", "#ff6a3d", "#7be04a", "#d46aff"];
let hardcore = false; // mode hardcore : des fantômes plus forts et plus rapides
let armeEquipee = null; // arme achetée dans la boutique (null = armes normales)
let boules = [];      // boules de feu des squelettes
let bombesFeu = [];   // bombes lancées par les squelettes en feu
let mevha = null;     // le robot qui aide le héros (arrive à la vague 10)
const accueil = document.getElementById("accueil");
const boutonJouer = document.getElementById("jouer");
const boutonMenu = document.getElementById("menu");
let touches = {};
let temps = 0;

// ----- Sons fabriqués avec le navigateur (pas de fichier audio) -----
let audio = null;
let sortieSon = null;     // réglage du volume général
let volumeGeneral = 1;
const AMPLIFICATION = 2.5; // tous les sons sont 2,5 fois plus forts (le curseur Son à 100 %)

function initAudio() {
  if (!audio) {
    try {
      audio = new AudioContext();
      sortieSon = audio.createGain();
      sortieSon.gain.value = volumeGeneral * AMPLIFICATION;
      // Un compresseur évite que le son grésille quand il est fort
      const compresseur = audio.createDynamicsCompressor();
      sortieSon.connect(compresseur);
      compresseur.connect(audio.destination);
    } catch (e) {}
  }
  if (audio && audio.state === "suspended") audio.resume();
  demarrerMusique();
}

// Le navigateur n'autorise le son qu'après un clic : la musique démarre au premier clic, même dans le menu
document.addEventListener("click", initAudio);

// Musique sinistre en boucle : un bourdonnement grave qui gonfle et dégonfle,
// et de longues notes tristes et lentes qui reviennent au hasard.
let musiqueLancee = false;
function demarrerMusique() {
  if (!audio || musiqueLancee) return;
  musiqueLancee = true;
  const filtre = audio.createBiquadFilter(); // adoucit le son pour qu'il reste sourd
  filtre.type = "lowpass";
  filtre.frequency.value = 220;
  const volumeDrone = audio.createGain();
  volumeDrone.gain.value = 0.22;
  filtre.connect(volumeDrone);
  volumeDrone.connect(sortieSon);
  [[55, "sine"], [55.5, "sawtooth"], [82.4, "triangle"]].forEach(function (n) {
    const osc = audio.createOscillator();
    osc.type = n[1];
    osc.frequency.value = n[0];
    osc.connect(filtre);
    osc.start();
  });
  // Un très lent va-et-vient du volume : le bourdonnement respire (10 secondes par respiration)
  const lent = audio.createOscillator();
  const profondeur = audio.createGain();
  lent.frequency.value = 0.1;
  profondeur.gain.value = 0.1;
  lent.connect(profondeur);
  profondeur.connect(volumeDrone.gain);
  lent.start();
  // Les notes tristes : gamme sombre (ré mineur avec un mi bémol qui fait peur)
  const NOTES_SOMBRES = [147, 155, 175, 196, 220, 233, 294];
  setInterval(function () {
    if (!audio || audio.state !== "running") return;
    const f = NOTES_SOMBRES[Math.floor(Math.random() * NOTES_SOMBRES.length)];
    note(f, 0, 3.5, "sine", 0.25);
    note(f / 2, 0, 3.5, "triangle", 0.15);
    if (Math.random() < 0.25) note(f * 2.12, 0.6, 2.5, "sine", 0.08); // une note aiguë qui grince un peu
  }, 3000);
}

// Joue une note : fréquence, moment de départ (en secondes), durée, forme, volume
function note(freq, debut, duree, forme, volume) {
  if (!audio) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  const t0 = audio.currentTime + debut;
  osc.type = forme;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duree);
  osc.connect(gain);
  gain.connect(sortieSon);
  osc.start(t0);
  osc.stop(t0 + duree + 0.05);
}

// Musique triste quand on perd : les notes descendent
function musiqueDefaite() {
  const melodie = [392, 370, 349, 330, 294, 262];
  melodie.forEach(function (f, i) {
    note(f, i * 0.4, 0.5, "triangle", 0.25);
    note(f / 2, i * 0.4, 0.5, "sine", 0.2);
  });
  note(196, melodie.length * 0.4, 1.6, "triangle", 0.3);
  note(98, melodie.length * 0.4, 1.6, "sine", 0.25);
}

// Voix inventée : une petite note par lettre, comme un charabia rigolo.
// Chaque personnage a sa voix : héros aiguë, alliés moyens, zombies graves, boss très graves.
const VOIX = {
  heros:  { base: 330, forme: "square",   volume: 0.05 },
  allie:  { base: 260, forme: "triangle", volume: 0.12 },
  zombie: { base: 120, forme: "sawtooth", volume: 0.05 },
  boss:   { base: 65,  forme: "sawtooth", volume: 0.08 },
  robot:  { base: 200, forme: "square",   volume: 0.06 }
};

function voix(texte, profil, hauteur, delaiSecondes) {
  if (!audio) return;
  const v = VOIX[profil];
  let moment = delaiSecondes;
  const lettres = texte.replace(/[^a-zA-ZÀ-ÿ]/g, "");
  for (let i = 0; i < lettres.length && i < 16; i++) {
    const code = lettres.charCodeAt(i);
    const freq = v.base * hauteur * (1 + (code % 7) * 0.08);
    note(freq, moment, 0.07, v.forme, v.volume);
    moment += 0.075;
  }
}

document.addEventListener("keydown", function (e) {
  initAudio();
  touches[e.code] = true;
  if (e.code === "Space") {
    e.preventDefault();
    if (!e.repeat) tirer();
  }
  if (e.code === "KeyB") lancerBombe();
});
document.addEventListener("keyup", function (e) {
  touches[e.code] = false;
});

function tirer() {
  if (modeHistoire) return; // dans la forêt, c'est tirerForet qui tire
  if (finDuJeu || enAttente || victoire || enPause) return;
  const arme = armeActive();
  recharge = arme.cadence;
  if (!joueurBulle.bulle && Math.random() < 0.12) {
    parler(joueurBulle, choisir(PHRASES_HEROS));
    zombieRepond();
  }
  const milieu = joueur.x + joueur.largeur / 2;
  for (let i = 0; i < arme.balles; i++) {
    const decalage = (i - (arme.balles - 1) / 2) * 12;
    balles.push({
      x: milieu + decalage,
      y: SOL - 50,
      dx: (i - (arme.balles - 1) / 2) * (arme.eventail || 0), // les balles s'écartent
      degats: (arme.degats || 1) * forceJoueur() // la force du héros multiplie les dégâts
    });
  }
}

// Expérience : chaque zombie battu donne de l'exp, chaque niveau rend le héros plus fort
let xp = 0;
let niveauJoueur = 1;

// Le niveau du héros est gardé dans le navigateur, même après avoir perdu ou fermé la page
function sauverNiveauHeros() {
  try {
    localStorage.setItem("niveauHerosZombies", JSON.stringify({ niveau: niveauJoueur, xp: xp }));
  } catch (e) {}
}

try {
  const sauveHeros = JSON.parse(localStorage.getItem("niveauHerosZombies"));
  if (sauveHeros && sauveHeros.niveau >= 1) {
    niveauJoueur = Math.floor(sauveHeros.niveau);
    xp = Math.max(0, sauveHeros.xp || 0);
  }
} catch (e) {}

function xpPourNiveauSuivant() {
  return niveauJoueur * 10;
}

// Le héros est déjà plus fort qu'avant (1,5) et gagne 0,25 de force par niveau
function forceJoueur() {
  return 1.5 + (niveauJoueur - 1) * 0.25;
}

function gagnerXp(n) {
  xp += n;
  while (xp >= xpPourNiveauSuivant()) {
    xp -= xpPourNiveauSuivant();
    niveauJoueur++;
    animMontee = 40;
    parler(joueurBulle, "Niveau " + niveauJoueur + " ! Je suis plus fort !");
  }
  sauverNiveauHeros();
}

// L'arme de la boutique (si on en a équipé une), sinon celle ramassée sur le chemin
function armeActive() {
  return armeEquipee || ARMES[niveauArme];
}

// Les alliés arrivent toutes les 3 vagues
let allies = [];
const COULEURS_ALLIES = [
  { corps: "#2e9e4f", casque: "#f2a33a" },
  { corps: "#e0b020", casque: "#2a8fbd" },
  { corps: "#8e44ad", casque: "#2e9e4f" }
];

function nouvelAllie() {
  const couleur = COULEURS_ALLIES[allies.length % COULEURS_ALLIES.length];
  const a = {
    x: 60 + Math.random() * (canvas.width - 150),
    largeur: 30,
    vitesse: 3,
    recharge: 30,
    marche: 0,
    couleur: couleur,
    bulle: null
  };
  allies.push(a);
  parler(a, "Je te couvre !");
}

// Super bombe : disponible à partir de la vague 6, une seule fois (touche B)
// Elle tombe du ciel au début de la vague 6 : il faut la ramasser
let bombeItem = null;
let bombeDispo = false;
let flashBlanc = 0;
let bombeUtilisee = false; // pour une quête

function lancerBombe() {
  if (finDuJeu || enAttente || enPause || !bombeDispo) return;
  bombeDispo = false;
  bombeUtilisee = true;
  flashBlanc = 1;
  zombies.forEach(function (z) {
    z.touche = true;
    zombiesTues++;
    gagnerPieces(z.boss ? 5 : 1);
    gagnerXp(z.boss ? 10 : 2);
    score += z.boss ? 10 : 1;
  });
  zombies = zombies.filter(function (z) { return !z.touche; });
  parler(joueurBulle, "Boum ! Plus personne !");
}

// Pour gagner : 45 vagues au level 1, puis une vague de plus à chaque victoire (46, 47...)
function vagueObjectif() {
  return 44 + niveau;
}

function nouvelleVague() {
  vague++;
  if (vague % 3 === 0) nouvelAllie();
  if (vague % 6 === 0 && !bombeItem && !bombeDispo) { // une bombe toutes les 6 vagues
    bombeItem = { x: 80 + Math.random() * (canvas.width - 160), y: -30 };
    parler(joueurBulle, "Une bombe arrive du ciel !");
  }
  if (vague === 10 && !mevha) {
    mevha = { x: 200, largeur: 50, vitesse: 3.5, recharge: 20, bulle: null };
    parler(mevha, "Mevha est là pour t'aider !");
  }
  if (vague === 15) {
    animManoir = 240; // petite scène : le héros entre dans le manoir
    parler(joueurBulle, "Un manoir sinistre...");
  }
  if (vague > 1) parler(joueurBulle, "Ils reviennent !");
  zombiesAApparaitre = 3 + vague; // les vagues passent plus vite
  prochainZombie = 0;
}

// Vêtements au hasard pour chaque zombie, boss compris
const HAUTS = ["#d32f2f", "#2a6fd0", "#e0b020", "#8e44ad", "#e67e22", "#16a085", "#c0398a", "#7f8c8d"];
const BAS = ["#3a3a4a", "#4a3a2a", "#2a3a5a", "#5a2a2a", "#2a4a3a"];
const CHAPEAUX = ["aucun", "casquette", "bonnet", "haut", "couronne"];
const TYPES_BOSS = ["citrouille", "squelette", "zombie"]; // un type différent à chaque boss

function tenueAleatoire(boss) {
  return {
    haut: choisir(HAUTS),
    bas: choisir(BAS),
    chapeau: choisir(CHAPEAUX),
    couleurChapeau: choisir(HAUTS),
    cravate: choisir(HAUTS),
    motif: Math.floor(Math.random() * 3), // 0 = uni, 1 = rayures, 2 = poche
    cape: boss ? choisir(HAUTS) : null
  };
}

function nouveauZombie(boss) {
  // Dernière vague avec un boss avant la victoire : le roi squelette. À partir de la vague 15 (le manoir) : des squelettes qui tirent.
  const roi = boss && vague === vagueObjectif() - (vagueObjectif() % 2);
  // Dans le manoir, 3 monstres sur 10 sont des chevaliers noirs à cheval qui chargent
  const chevalier = !boss && vague >= 15 && !hardcore && Math.random() < 0.3;
  // Dès la vague 7, 3 monstres sur 10 sont des squelettes en feu qui lancent des bombes
  const feu = !boss && vague >= 7 && !hardcore && !chevalier && Math.random() < 0.3;
  const sbire = !boss && vague >= 15 && !hardcore && !chevalier && !feu;
  // Mode hardcore : tous les monstres sont des fantômes (sauf le roi squelette)
  // Vague 10 (mode normal) : le boss kraken, énorme, qui invoque des mini krakens
  const kraken = boss && vague === 10 && !hardcore;
  const type = kraken ? "kraken" : roi || sbire || feu ? "squelette" : chevalier ? "chevalier" : hardcore ? "fantome" : boss ? TYPES_BOSS[(vague / 2 - 1) % TYPES_BOSS.length] : "zombie";
  // plus de vie à chaque vague, deux fois plus en hardcore, et les chevaliers sont solides
  const pvBase = kraken ? 100 : (boss ? 6 + vague * 3 : Math.ceil(vague * 0.7) + (niveau - 1)) * (hardcore ? 2 : 1) * (chevalier ? 2 : 1);
  const pvDepart = pvBase;
  zombies.push({
    type: type,
    tireur: roi || sbire,
    roi: roi,
    feu: feu,
    bombeDans: 80 + Math.random() * 80,
    tirDans: 60 + Math.random() * 80,
    tenue: tenueAleatoire(boss),
    hauteurVoix: 0.8 + Math.random() * 0.4,
    kraken: kraken,
    invoqueDans: 120,
    x: kraken ? (canvas.width - 200) / 2 : 20 + Math.random() * (canvas.width - 70),
    y: kraken ? -170 : boss ? -100 : -50,
    largeur: kraken ? 200 : boss ? 60 : chevalier ? 40 : 30,
    hauteur: kraken ? 160 : boss ? 100 : chevalier ? 64 : 50,
    echelle: kraken ? 1 : boss ? 2 : 1,
    boss: boss,
    pv: pvDepart,
    pvMax: pvDepart,
    // plus rapide à chaque vague, et une fois et demie plus rapide en hardcore
    vitesse: (roi ? 0.6 : boss ? 1 + vague * 0.05 : 1.8 + Math.random() * 0.8 + vague * 0.2) * (hardcore ? 1.5 : 1) * (chevalier ? 1.6 : 1) * 0.6 * (hardcore ? 1 : 0.5), // monstres plus lents, encore plus en mode normal
    phase: Math.random() * 10,     // pour que chaque zombie ait son propre rythme
    balancement: 0.5 + Math.random() * 0.8
  });
  // Le boss se présente, les autres parlent parfois
  const nouveau = zombies[zombies.length - 1];
  if (roi) parler(nouveau, "Je suis le roi squelette !");
  else if (boss) parler(nouveau, PHRASES_TYPE_BOSS[type]);
  else if (chevalier && Math.random() < 0.5) parler(nouveau, "Hiii-ha ! À l'attaque !");
  else if (Math.random() < 0.25) parler(nouveau, choisir(PHRASES_ZOMBIES));
}

// Le kraken invoque un mini kraken près de ses tentacules
function nouveauMiniKraken(kraken) {
  zombies.push({
    type: "minikraken",
    tireur: false, roi: false, feu: false, boss: false, kraken: false,
    bombeDans: 999, tirDans: 999,
    tenue: tenueAleatoire(false),
    hauteurVoix: 1.3,
    x: kraken.x + 10 + Math.random() * (kraken.largeur - 50),
    y: kraken.y + kraken.hauteur * 0.7,
    largeur: 40, hauteur: 40, echelle: 1,
    pv: 2, pvMax: 2,
    vitesse: 0.9,
    phase: Math.random() * 10,
    balancement: 0.8 + Math.random() * 0.8
  });
}

// Un squelette lance une boule de feu vers le héros (bleue et géante pour le roi)
function lancerBoule(z) {
  const x = z.x + z.largeur / 2;
  const y = z.y + z.hauteur * 0.5;
  const dx = joueur.x + joueur.largeur / 2 - x;
  const dy = SOL - 30 - y;
  const d = Math.hypot(dx, dy) || 1;
  const v = z.roi ? 3 : 4;
  boules.push({
    x: x, y: y,
    vx: dx / d * v, vy: dy / d * v,
    r: z.roi ? 26 : 10,
    bleue: z.roi,
    degats: z.roi ? 10 : 5
  });
}

// Le héros perd des vies (zombie arrivé en bas ou boule de feu)
function toucherHeros(degats) {
  vies -= degats;
  flashRouge = 1;
  parler(joueurBulle, "Aïe !");
  zombieRepond();
  if (vies <= 0 && !finDuJeu) {
    finDuJeu = true;
    boutonRejouer.style.display = "inline-block";
    boutonMenu.style.display = "inline-block";
    musiqueDefaite();
  }
}

// Niveau terminé : on propose de continuer ou d'aller au lobby
function finirNiveau() {
  victoire = true;
  boules = [];
  bombesFeu = [];
  confettis = [];
  for (let i = 0; i < 80; i++) {
    confettis.push({
      x: Math.random() * canvas.width,
      y: -Math.random() * 300,
      vy: 1.5 + Math.random() * 2.5,
      vx: Math.random() - 0.5,
      taille: 4 + Math.random() * 5,
      couleur: choisir(COULEURS_NIVEAU.concat(["#fff", "#d32f2f"]))
    });
  }
  document.getElementById("texteVictoire").textContent = "Bravo ! Level " + niveau + " terminé !";
  document.getElementById("boutonContinuer").textContent = "Continuer au level " + (niveau + 1);
  document.getElementById("victoire").style.display = "flex";
}

function miseAJour() {
  if (finDuJeu || enAttente || victoire || enPause) return;
  temps++;
  if (animManoir > 0) { // pendant la scène du manoir, le jeu attend
    animManoir--;
    return;
  }
  if (animNiveau > 0) animNiveau--;
  if (animMontee > 0) animMontee--;

  if (touches["ArrowLeft"] && joueur.x > 0) joueur.x -= joueur.vitesse;
  if (touches["ArrowRight"] && joueur.x < canvas.width - joueur.largeur) joueur.x += joueur.vitesse;

  // Un seul tir par appui sur espace (plus de tir automatique)
  recharge--;

  balles.forEach(function (b) {
    b.y -= 10;
    b.x += b.dx || 0;
  });
  balles = balles.filter(function (b) { return b.y > -10 && b.x > -10 && b.x < canvas.width + 10; });

  // Les armes tombent du ciel, le héros les ramasse en les touchant
  prochaineArme--;
  if (prochaineArme <= 0) {
    armes.push({ x: 20 + Math.random() * (canvas.width - 60), y: -20 });
    prochaineArme = 500 + Math.random() * 300;
  }
  armes.forEach(function (a) {
    a.y += 2;
    if (a.y > SOL - 60 && a.y < SOL + 10 && a.x + 30 > joueur.x && a.x < joueur.x + joueur.largeur) {
      a.prise = true;
      if (niveauArme < ARMES.length - 1) niveauArme++;
    }
  });
  armes = armes.filter(function (a) { return !a.prise && a.y < canvas.height; });

  // La bombe tombe jusqu'au sol puis attend d'être ramassée
  if (bombeItem) {
    if (bombeItem.y < SOL - 25) bombeItem.y += 2;
    if (bombeItem.y > SOL - 70 && bombeItem.x + 15 > joueur.x && bombeItem.x - 15 < joueur.x + joueur.largeur) {
      bombeItem = null;
      bombeDispo = true;
      parler(joueurBulle, "J'ai la bombe ! Touche B !");
    }
  }

  // Gestion des vagues
  if (zombiesAApparaitre > 0) {
    prochainZombie--;
    if (prochainZombie <= 0) {
      zombiesAApparaitre--;
      // Toutes les 2 vagues, le dernier à arriver est un gros boss
      nouveauZombie(vague % 2 === 0 && zombiesAApparaitre === 0);
      prochainZombie = 12; // les monstres arrivent vite, donc la vague est vite finie
    }
  } else if (zombies.length === 0) {
    if (pause === 0) gagnerTrophees(5); // 5 trophées à chaque vague terminée
    if (vague >= vagueObjectif()) { // dernière vague terminée : la partie est gagnée
      finirNiveau();
      return;
    }
    pause++;
    if (pause > 25) { // courte pause entre deux vagues
      pause = 0;
      nouvelleVague();
    }
  }

  // Les zombies avancent en se balançant
  zombies.forEach(function (z) {
    z.y += z.vitesse;
    if (z.kraken && z.y > 0) { // le kraken invoque un mini kraken de temps en temps (6 au maximum)
      z.invoqueDans--;
      const minis = zombies.filter(function (m) { return m.type === "minikraken"; }).length;
      if (z.invoqueDans <= 0 && minis < 6) {
        z.invoqueDans = 130;
        nouveauMiniKraken(z);
      }
    }
    // Il ne suit plus le héros : il descend tout droit en se balançant
    z.x += Math.sin((temps + z.phase * 10) / 15) * z.balancement * 0.5;
    z.x = Math.max(0, Math.min(canvas.width - z.largeur, z.x));
  });

  // Les squelettes en feu lancent une bombe sur l'endroit où se trouve le héros
  zombies.forEach(function (z) {
    if (!z.feu || z.y < 0) return;
    z.bombeDans--;
    if (z.bombeDans <= 0) {
      z.bombeDans = 170;
      bombesFeu.push({
        sx: z.x + z.largeur / 2, sy: z.y,
        cx: joueur.x + joueur.largeur / 2 + (Math.random() - 0.5) * 30, cy: SOL - 25,
        t: 0, duree: 70, explose: 0
      });
    }
  });
  bombesFeu.forEach(function (b) {
    b.t++;
    if (b.t === b.duree) {
      b.explose = 20; // la bombe explose : dégâts si le héros est tout près
      if (Math.hypot(b.cx - (joueur.x + joueur.largeur / 2), b.cy - (SOL - 25)) < 50) toucherHeros(5);
    } else if (b.t > b.duree) {
      b.explose--;
    }
  });
  bombesFeu = bombesFeu.filter(function (b) { return b.t <= b.duree || b.explose > 0; });

  // Les squelettes tirent des boules de feu
  zombies.forEach(function (z) {
    if (!z.tireur || z.y < 0) return;
    z.tirDans--;
    if (z.tirDans <= 0) {
      z.tirDans = z.roi ? 110 : 150;
      lancerBoule(z);
    }
  });
  boules.forEach(function (b) {
    b.x += b.vx;
    b.y += b.vy;
    if (Math.hypot(b.x - (joueur.x + joueur.largeur / 2), b.y - (SOL - 30)) < b.r + 18) {
      b.touche = true;
      toucherHeros(b.degats);
    }
  });
  boules = boules.filter(function (b) {
    return !b.touche && b.y < canvas.height + 40 && b.x > -40 && b.x < canvas.width + 40;
  });

  // Mevha le robot se place sous le zombie le plus bas et tire vite
  if (mevha) {
    let cible = null;
    zombies.forEach(function (z) {
      if (!cible || z.y > cible.y) cible = z;
    });
    mevha.marche = 0;
    mevha.recharge--;
    if (cible) {
      const dx = cible.x + cible.largeur / 2 - (mevha.x + mevha.largeur / 2);
      if (Math.abs(dx) > mevha.vitesse) {
        mevha.x += dx > 0 ? mevha.vitesse : -mevha.vitesse;
      } else if (mevha.recharge <= 0 && cible.y > 0) {
        balles.push({ x: mevha.x + 1, y: SOL - 70 });
        balles.push({ x: mevha.x + 49, y: SOL - 70 });
        mevha.recharge = 22;
      }
    }
    mevha.x = Math.max(0, Math.min(canvas.width - mevha.largeur, mevha.x));
  }

  // Les alliés se placent sous le zombie le plus proche et tirent dessus
  allies.forEach(function (a) {
    let cible = null;
    zombies.forEach(function (z) {
      if (!cible || z.y > cible.y) cible = z;
    });
    a.marche = 0;
    a.recharge--;
    if (cible) {
      const dx = cible.x + cible.largeur / 2 - (a.x + a.largeur / 2);
      if (Math.abs(dx) > a.vitesse) {
        a.x += dx > 0 ? a.vitesse : -a.vitesse;
        a.marche = temps / 3;
      } else if (a.recharge <= 0 && cible.y > 0) {
        balles.push({ x: a.x + a.largeur / 2, y: SOL - 50 });
        a.recharge = 35;
      }
    }
    a.x = Math.max(0, Math.min(canvas.width - a.largeur, a.x));
  });

  // Les bulles de dialogue disparaissent au bout d'un moment
  zombies.concat(allies, [joueurBulle], mevha ? [mevha] : []).forEach(function (o) {
    if (!o.bulle) return;
    if (o.bulle.delai > 0) o.bulle.delai--;
    else if (--o.bulle.reste <= 0) o.bulle = null;
  });

  // Une balle arrête une petite boule de feu (pas la géante)
  balles.forEach(function (b) {
    boules.forEach(function (f) {
      if (!f.bleue && !f.touche && Math.abs(b.x - f.x) < f.r + 3 && Math.abs(b.y - f.y) < f.r + 10) {
        f.touche = true;
        b.y = -100;
      }
    });
  });
  boules = boules.filter(function (f) { return !f.touche; });

  // Une balle touche un zombie
  balles.forEach(function (b) {
    zombies.forEach(function (z) {
      if (!z.touche && b.x > z.x && b.x < z.x + z.largeur && b.y > z.y - 10 * z.echelle && b.y < z.y + z.hauteur) {
        b.y = -100;
        z.pv -= b.degats || 1;
        if (z.pv <= 0) {
          z.touche = true;
          zombiesTues++;
          gagnerPieces(z.boss ? 5 : 1);
          gagnerXp(z.boss ? 10 : 2);
          score += z.boss ? 10 : 1;
        }
      }
    });
  });

  // Un zombie arrive en bas : le héros perd une vie
  zombies.forEach(function (z) {
    if (z.y + z.hauteur >= SOL) {
      z.touche = true;
      toucherHeros(10);
    }
  });
  zombies = zombies.filter(function (z) { return !z.touche; });

  if (zombiesTues > record) {
    record = zombiesTues;
    try {
      localStorage.setItem("recordZombies", record);
    } catch (e) {}
  }

  verifierQuetes();

  infos.textContent = (hardcore ? "HARDCORE | " : "") + "Level " + niveau + " | Vague : " + vague + " | Score : " + score + " | Vie : " + Math.max(vies, 0) + " | Pièces : " + pieces + " | Niveau héros : " + niveauJoueur + " (exp " + xp + "/" + xpPourNiveauSuivant() + ", force " + forceJoueur().toFixed(2) + ") | Trophées : " + trophees + " | Arme : " + armeActive().nom +
    (bombeDispo ? " | BOMBE PRÊTE : touche B" : "");
}

// Dessine un personnage vu de face avec des jambes qui marchent
function dessinerPersonnage(x, y, couleurCorps, couleurTete, pas, couleurJambes) {
  const jambe = Math.sin(pas) * 6;
  // Ombre au sol
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.beginPath();
  ctx.ellipse(x + 15, y + 52, 18, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Jambes et chaussures
  ctx.fillStyle = couleurJambes || "#3a3a4a";
  ctx.fillRect(x + 5, y + 35, 8, 12 + jambe);
  ctx.fillRect(x + 17, y + 35, 8, 12 - jambe);
  ctx.fillStyle = "#1c1c1c";
  ctx.fillRect(x + 3, y + 46 + jambe, 11, 5);
  ctx.fillRect(x + 16, y + 46 - jambe, 11, 5);
  // Corps arrondi avec ceinture
  ctx.fillStyle = couleurCorps;
  ctx.beginPath();
  ctx.roundRect(x, y + 10, 30, 28, 6);
  ctx.fill();
  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  ctx.fillRect(x, y + 31, 30, 4);
  // Cou et tête
  ctx.fillStyle = couleurTete;
  ctx.fillRect(x + 11, y + 6, 8, 8);
  ctx.beginPath();
  ctx.arc(x + 15, y, 11, 0, Math.PI * 2);
  ctx.fill();
}

// Dessine une arme tournée vers le haut. (cx, by) = position de la main.
function dessinerPistolet(cx, by) {
  ctx.fillStyle = "#2b2b2b";
  ctx.fillRect(cx - 2, by - 18, 5, 18);      // canon
  ctx.fillStyle = "#777";
  ctx.fillRect(cx - 2, by - 18, 2, 14);      // reflet
  ctx.fillStyle = "#7a4a22";
  ctx.fillRect(cx - 3, by - 4, 7, 9);        // crosse
}

function dessinerArme(cx, by, niveau) {
  if (niveau === 0) {
    dessinerPistolet(cx, by);
  } else if (niveau === 1) {
    // Deux pistolets, un dans chaque main
    dessinerPistolet(cx - 8, by);
    dessinerPistolet(cx + 8, by);
  } else if (niveau === 2) {
    // AK-47 : long canon, bois marron et chargeur courbé
    ctx.fillStyle = "#444";
    ctx.fillRect(cx - 2, by - 42, 4, 42);
    ctx.fillRect(cx - 3, by - 45, 6, 3);      // guidon
    ctx.fillStyle = "#8b5a2b";
    ctx.fillRect(cx - 3, by - 28, 6, 14);     // garde-main en bois
    ctx.fillRect(cx - 3, by, 6, 12);          // crosse en bois
    ctx.fillStyle = "#222";
    ctx.fillRect(cx + 3, by - 12, 5, 8);      // chargeur courbé
    ctx.fillRect(cx + 5, by - 5, 5, 8);
  } else {
    // Mitraillette : corps épais, gros chargeur rond et bout orange
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(cx - 4, by - 38, 8, 38);
    ctx.fillStyle = "#555";
    ctx.fillRect(cx - 2, by - 48, 4, 10);
    ctx.fillStyle = "#f08a24";
    ctx.fillRect(cx - 3, by - 51, 6, 4);
    ctx.fillStyle = "#333";
    ctx.beginPath();
    ctx.arc(cx + 10, by - 16, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f08a24";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#7a4a22";
    ctx.fillRect(cx - 3, by - 2, 7, 9);
  }
}

// Fissures de la route : tracées une seule fois au hasard
const fissures = [];
for (let i = 0; i < 9; i++) {
  const points = [{ x: 70 + Math.random() * 360, y: Math.random() * 520 }];
  for (let j = 0; j < 5; j++) {
    const dernier = points[points.length - 1];
    points.push({ x: dernier.x + (Math.random() - 0.5) * 50, y: dernier.y + 15 + Math.random() * 25 });
  }
  fissures.push(points);
}

// Cailloux posés au hasard sur la route
const cailloux = [];
for (let i = 0; i < 25; i++) {
  cailloux.push({
    x: 70 + Math.random() * 360,
    y: Math.random() * 560,
    r: 2 + Math.random() * 4,
    couleur: Math.random() < 0.5 ? "#7d5a38" : "#9a8a78"
  });
}

// ----- Dialogues -----
const PHRASES_HEROS = ["Prends ça !", "Pas touche !", "Reste là !", "Je n'ai pas peur !"];
const PHRASES_ZOMBIES = ["Grrr !", "Hé, attends-moi !", "J'ai faim...", "Rrrah !", "Je t'arrive !"];
const PHRASES_BOSS = ["Je suis le chef !", "Tu ne m'arrêteras pas !"];
const PHRASES_TYPE_BOSS = {
  kraken: "Glou glou ! Je suis le Kraken géant !",
  fantome:"Ouuuh ! Je suis le roi des fantômes !",
  citrouille: "Bouh ! Je suis la citrouille !",
  squelette: "Clac clac ! Squelette !",
  zombie: "Je suis le grand chef !"
};
const joueurBulle = { bulle: null };

function parler(qui, texte, delai) {
  qui.bulle = { texte: texte, reste: 110, delai: delai || 0 };
  // Plus de petit bruit de voix : les phrases s'affichent seulement dans les bulles
}

function choisir(liste) {
  return liste[Math.floor(Math.random() * liste.length)];
}

// Quand le héros parle, un zombie lui répond un peu après
function zombieRepond() {
  const libres = zombies.filter(function (z) { return !z.bulle; });
  if (libres.length > 0) {
    const z = choisir(libres);
    parler(z, z.boss ? choisir(PHRASES_BOSS) : choisir(PHRASES_ZOMBIES), 50);
  }
}

function dessinerBulle(qui, x, y) {
  const b = qui.bulle;
  if (!b || b.delai > 0) return;
  ctx.font = "13px Arial";
  const largeur = ctx.measureText(b.texte).width + 16;
  const bx = Math.max(2, Math.min(canvas.width - largeur - 2, x - largeur / 2));
  const by = Math.max(4, y - 28);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.roundRect(bx, by, largeur, 22, 8);
  ctx.fill();
  ctx.beginPath(); // petite pointe vers le personnage
  ctx.moveTo(x - 5, by + 22);
  ctx.lineTo(x + 5, by + 22);
  ctx.lineTo(x, by + 29);
  ctx.fill();
  ctx.fillStyle = "#222";
  ctx.textAlign = "center";
  ctx.fillText(b.texte, bx + largeur / 2, by + 15);
}

// Dessine un fantôme (mode hardcore) : il flotte et sa couleur change un peu
function dessinerFantome(z) {
  const flotte = Math.sin(temps / 10 + z.phase) * 3;
  ctx.save();
  ctx.translate(z.x, z.y + flotte);
  ctx.scale(z.echelle, z.echelle);
  ctx.globalAlpha = 0.65 + Math.sin(temps / 15 + z.phase) * 0.15;
  ctx.shadowColor = z.boss ? "#ff6060" : "#2a7bff";
  ctx.shadowBlur = 15;
  ctx.fillStyle = z.boss ? "#eef2ff" : "#5aa0ff"; // fantômes bleus
  ctx.beginPath(); // tête ronde, corps, bas en vagues
  ctx.moveTo(0, 50);
  ctx.lineTo(0, 15);
  ctx.arc(15, 15, 15, Math.PI, 0);
  ctx.lineTo(30, 50);
  ctx.lineTo(24, 44 + flotte);
  ctx.lineTo(18, 50);
  ctx.lineTo(12, 44 - flotte);
  ctx.lineTo(6, 50);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath(); // petits bras
  ctx.ellipse(-3, 30 + brasFantome(z), 5, 9, 0.3, 0, Math.PI * 2);
  ctx.ellipse(33, 30 - brasFantome(z), 5, 9, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = z.boss ? "#e22" : "#111"; // yeux et bouche
  ctx.beginPath();
  ctx.ellipse(10, 16, 3, 5, 0, 0, Math.PI * 2);
  ctx.ellipse(20, 16, 3, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.ellipse(15, 29, 4, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Dessine un chevalier en armure noire sur un cheval qui galope vers le héros
function dessinerChevalier(z) {
  const trot = Math.sin(temps / 3 + z.phase) * 5;
  ctx.save();
  ctx.translate(z.x, z.y);
  ctx.fillStyle = "rgba(0, 0, 0, 0.3)"; // ombre
  ctx.beginPath();
  ctx.ellipse(20, 62, 24, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2a1c16"; // pattes du cheval
  ctx.fillRect(5, 42, 6, 16 + trot);
  ctx.fillRect(14, 42, 6, 16 - trot);
  ctx.fillRect(22, 42, 6, 16 + trot);
  ctx.fillRect(31, 42, 6, 16 - trot);
  ctx.fillStyle = "#3a2a22"; // corps et tête du cheval
  ctx.beginPath();
  ctx.ellipse(20, 38, 20, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(20, 55, 8, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(13, 42, 14, 4);
  ctx.fillStyle = "#1a1210"; // crinière et oreilles
  ctx.fillRect(18, 42, 4, 12);
  ctx.fillRect(13, 44, 3, 6);
  ctx.fillRect(24, 44, 3, 6);
  ctx.fillStyle = "#e33"; // yeux rouges
  ctx.fillRect(15, 54, 3, 3);
  ctx.fillRect(22, 54, 3, 3);
  ctx.fillStyle = "#555"; // lance
  ctx.fillRect(35, -8, 3, 52);
  ctx.beginPath();
  ctx.moveTo(33, -8);
  ctx.lineTo(40, -8);
  ctx.lineTo(36.5, -20);
  ctx.fill();
  ctx.fillStyle = "#15151a"; // armure noire du cavalier
  ctx.beginPath();
  ctx.roundRect(9, 10, 22, 28, 5);
  ctx.fill();
  ctx.fillStyle = "#3a3a48"; // reflets sur l'armure
  ctx.fillRect(11, 12, 3, 22);
  ctx.fillRect(8, 12, 7, 5);
  ctx.fillRect(25, 12, 7, 5);
  ctx.fillStyle = "#15151a"; // casque
  ctx.beginPath();
  ctx.arc(20, 4, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e33"; // fente rouge du casque
  ctx.fillRect(13, 3, 14, 3);
  ctx.fillStyle = "#d32f2f"; // plumet qui flotte
  ctx.beginPath();
  ctx.moveTo(20, -5);
  ctx.lineTo(14 + trot, -16);
  ctx.lineTo(24 + trot, -12);
  ctx.fill();
  ctx.restore();
}

// Scène de la vague 15 : le héros entre dans le manoir et les squelettes l'attendent
function dessinerSceneManoir() {
  const p = 1 - animManoir / 240; // va de 0 à 1
  const ouverture = Math.max(0, Math.min((p - 0.15) / 0.3, 1)); // la porte s'ouvre
  const marche = Math.max(0, Math.min((p - 0.3) / 0.45, 1));    // le héros avance
  ctx.save();
  ctx.fillStyle = "#07030f"; // nuit
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#c9c2e0"; // lune
  ctx.beginPath();
  ctx.arc(400, 70, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1d1426"; // murs et tours du manoir
  ctx.fillRect(80, 220, 340, 260);
  ctx.fillRect(60, 160, 70, 320);
  ctx.fillRect(370, 160, 70, 320);
  ctx.fillStyle = "#10091a"; // toits pointus
  [[50, 140, 95, 90], [360, 450, 405, 90], [70, 430, 250, 140]].forEach(function (t, i) {
    const basY = i === 2 ? 220 : 160;
    ctx.beginPath();
    ctx.moveTo(t[0], basY);
    ctx.lineTo(t[1], basY);
    ctx.lineTo(t[2], t[3]);
    ctx.fill();
  });
  [[110, 250], [160, 250], [310, 250], [360, 250], [85, 190], [395, 190]].forEach(function (f, i) {
    ctx.fillStyle = "rgba(255, 154, 42, " + (0.6 + Math.sin(temps / 6 + i * 2) * 0.35) + ")"; // bougies
    ctx.fillRect(f[0], f[1], 22, 30);
  });
  ctx.fillStyle = "#140c18"; // sol
  ctx.fillRect(0, 480, canvas.width, 120);
  ctx.fillStyle = "#000"; // l'intérieur de la porte
  ctx.fillRect(205, 330, 90, 150);
  ctx.fillStyle = "rgba(255, 154, 42, " + ouverture * 0.5 + ")";
  ctx.fillRect(210, 335, 80, 145);
  ctx.fillStyle = "#4a2a14"; // les deux battants s'écartent
  ctx.fillRect(210, 335, 40 * (1 - ouverture), 145);
  ctx.fillRect(290 - 40 * (1 - ouverture), 335, 40 * (1 - ouverture), 145);
  // Deux squelettes surgissent sur les côtés et lancent des boules de feu
  const surgit = Math.max(0, Math.min((p - 0.6) / 0.2, 1));
  [140, 360].forEach(function (sx) {
    if (surgit <= 0) return;
    ctx.fillStyle = "#f2f2ea";
    ctx.beginPath();
    ctx.arc(sx, 430, 16 * surgit, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(sx - 8 * surgit, 440, 16 * surgit, 30 * surgit);
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.arc(sx - 6 * surgit, 428, 4 * surgit, 0, Math.PI * 2);
    ctx.arc(sx + 6 * surgit, 428, 4 * surgit, 0, Math.PI * 2);
    ctx.fill();
    const tir = Math.max(0, (p - 0.8) / 0.2); // la boule de feu file vers le héros
    if (tir > 0) {
      ctx.fillStyle = "#ff7a1a";
      ctx.beginPath();
      ctx.arc(sx + (250 - sx) * tir, 430 + (400 - 430) * tir, 10, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  // Le héros marche vers la porte et devient plus petit
  ctx.save();
  ctx.translate(250, 560 - marche * 120);
  ctx.scale(1 - 0.4 * marche, 1 - 0.4 * marche);
  dessinerHeros(-15, -50, tenueHeros, marche < 1 ? temps / 3 : 0, armeEquipee || niveauArme);
  ctx.restore();
  ctx.fillStyle = "#fff"; // titre
  ctx.font = "bold 32px Arial";
  ctx.textAlign = "center";
  ctx.fillText("Le manoir sinistre...", canvas.width / 2, 50);
  const noir = p < 0.1 ? 1 - p / 0.1 : p > 0.93 ? (p - 0.93) / 0.07 : 0; // fondu au noir
  ctx.fillStyle = "rgba(0, 0, 0, " + noir + ")";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function brasFantome(z) {
  return Math.sin(temps / 8 + z.phase) * 3;
}

// Dessine un zombie ou un boss avec ses vêtements au hasard
// Le kraken géant (200 x 160) : tête violette, gros yeux fâchés et tentacules qui ondulent
function dessinerKraken(z) {
  ctx.save();
  ctx.translate(z.x, z.y);
  ctx.lineCap = "round";
  for (let i = 0; i < 7; i++) { // tentacules
    const x0 = 22 + i * 26;
    ctx.strokeStyle = i % 2 ? "#6a3a9a" : "#5a2a8a";
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(x0, 80);
    ctx.bezierCurveTo(x0 + Math.sin(temps / 10 + i) * 18, 105, x0 - Math.sin(temps / 10 + i) * 18, 130, x0 + Math.sin(temps / 8 + i * 2) * 14, 158);
    ctx.stroke();
    ctx.fillStyle = "#c9a0e8"; // ventouses
    ctx.beginPath();
    ctx.arc(x0, 112, 3, 0, Math.PI * 2);
    ctx.arc(x0, 134, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#5a2a8a"; // grosse tête
  ctx.beginPath();
  ctx.ellipse(100, 55, 92, 58, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#7a4ab0"; // taches claires
  ctx.beginPath();
  ctx.arc(60, 28, 9, 0, Math.PI * 2);
  ctx.arc(140, 24, 7, 0, Math.PI * 2);
  ctx.arc(104, 12, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff"; // yeux
  ctx.beginPath();
  ctx.arc(68, 58, 18, 0, Math.PI * 2);
  ctx.arc(132, 58, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e22";
  ctx.beginPath();
  ctx.arc(70, 62, 9, 0, Math.PI * 2);
  ctx.arc(130, 62, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#220a38"; // sourcils fâchés
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(46, 34); ctx.lineTo(86, 46);
  ctx.moveTo(154, 34); ctx.lineTo(114, 46);
  ctx.stroke();
  ctx.fillStyle = "#220a38"; // bouche
  ctx.beginPath();
  ctx.arc(100, 90, 14, 0, Math.PI);
  ctx.fill();
  ctx.restore();
}

// Un mini kraken (40 x 40)
function dessinerMiniKraken(z) {
  ctx.save();
  ctx.translate(z.x, z.y);
  ctx.lineCap = "round";
  ctx.strokeStyle = "#a05ad0";
  ctx.lineWidth = 5;
  for (let i = 0; i < 4; i++) {
    const x0 = 8 + i * 8;
    ctx.beginPath();
    ctx.moveTo(x0, 22);
    ctx.quadraticCurveTo(x0 + Math.sin(temps / 6 + z.phase + i) * 6, 32, x0 + Math.sin(temps / 5 + i) * 5, 40);
    ctx.stroke();
  }
  ctx.fillStyle = "#b878e0";
  ctx.beginPath();
  ctx.arc(20, 16, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(14, 16, 5, 0, Math.PI * 2);
  ctx.arc(26, 16, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.fillRect(13, 15, 3, 3);
  ctx.fillRect(25, 15, 3, 3);
  ctx.restore();
}

function dessinerZombie(z) {
  if (z.type === "kraken") {
    dessinerKraken(z);
    return;
  }
  if (z.type === "minikraken") {
    dessinerMiniKraken(z);
    return;
  }
  if (z.type === "fantome") {
    dessinerFantome(z);
    return;
  }
  if (z.type === "chevalier") {
    dessinerChevalier(z);
    return;
  }
  const t = z.tenue;
  const peau = z.type === "citrouille" ? "#f08a24" : z.type === "squelette" ? "#f2f2ea" : (z.boss ? "#6fb04a" : "#8fd16a");
  const brasBouge = Math.sin(temps / 8 + z.phase) * 4;

  ctx.save();
  ctx.translate(z.x, z.y);
  ctx.scale(z.echelle, z.echelle);

  // Cape des boss
  if (z.boss) {
    ctx.fillStyle = t.cape;
    ctx.beginPath();
    ctx.moveTo(-4, 10);
    ctx.lineTo(34, 10);
    ctx.lineTo(38, 44 + Math.sin(temps / 10 + z.phase) * 3);
    ctx.lineTo(-8, 44 - Math.sin(temps / 10 + z.phase) * 3);
    ctx.fill();
  }

  dessinerPersonnage(0, 0, t.haut, peau, temps / 4 + z.phase, t.bas);

  // Motif sur le haut
  if (t.motif === 1) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    ctx.fillRect(0, 16, 30, 3);
    ctx.fillRect(0, 24, 30, 3);
  } else if (t.motif === 2) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    ctx.fillRect(4, 16, 9, 8);
  }
  if (z.boss) {
    // Chemise blanche, cravate et boutons dorés
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(10, 10);
    ctx.lineTo(20, 10);
    ctx.lineTo(15, 22);
    ctx.fill();
    ctx.fillStyle = t.cravate;
    ctx.fillRect(13, 14, 4, 16);
    ctx.fillStyle = "#e8c030";
    ctx.fillRect(5, 26, 3, 3);
    ctx.fillRect(22, 26, 3, 3);
  }

  // Bras tendus avec des manches et des mains
  ctx.fillStyle = peau;
  ctx.fillRect(-6, 14, 8, 20 + brasBouge);
  ctx.fillRect(28, 14, 8, 20 - brasBouge);
  ctx.fillRect(-7, 32 + brasBouge, 10, 6);
  ctx.fillRect(27, 32 - brasBouge, 10, 6);
  ctx.fillStyle = t.haut;
  ctx.fillRect(-6, 14, 8, 10);
  ctx.fillRect(28, 14, 8, 10);

  // Vêtements un peu déchirés
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.fillRect(0, 34, 6, 4);
  ctx.fillRect(12, 36, 6, 2);
  ctx.fillRect(24, 34, 6, 4);

  // Tête selon le type
  if (z.type === "citrouille") {
    ctx.fillStyle = "#f08a24";
    ctx.beginPath();
    ctx.arc(15, -2, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#c06a10"; // côtes de la citrouille
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(15, -2, 7, 15, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#3f7a2a"; // queue verte
    ctx.fillRect(13, -21, 5, 7);
    ctx.fillStyle = "#ffe98a"; // yeux lumineux
    ctx.beginPath();
    ctx.moveTo(6, -4); ctx.lineTo(13, -4); ctx.lineTo(9.5, -11); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(17, -4); ctx.lineTo(24, -4); ctx.lineTo(20.5, -11); ctx.fill();
    ctx.beginPath(); // grand sourire en dents de scie
    ctx.moveTo(6, 3);
    ctx.lineTo(10, 8); ctx.lineTo(13, 3); ctx.lineTo(17, 8); ctx.lineTo(20, 3); ctx.lineTo(24, 3);
    ctx.lineTo(20, 10); ctx.lineTo(10, 10);
    ctx.fill();
  } else if (z.type === "squelette") {
    ctx.fillStyle = "#222"; // orbites et nez
    ctx.beginPath();
    ctx.arc(10, -2, 4, 0, Math.PI * 2);
    ctx.arc(20, -2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(13, 3); ctx.lineTo(17, 3); ctx.lineTo(15, 0); ctx.fill();
    ctx.fillStyle = "#fff"; // lueur dans les yeux
    ctx.fillRect(9, -3, 2, 2);
    ctx.fillRect(19, -3, 2, 2);
    ctx.fillStyle = "#222"; // dents
    ctx.fillRect(9, 6, 12, 1.5);
    for (let d = 10; d < 21; d += 3) ctx.fillRect(d, 5, 1, 4);
    // côtes sur le haut
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.fillRect(8, 18, 14, 2);
    ctx.fillRect(8, 24, 14, 2);
  } else {
    ctx.fillStyle = z.boss ? "#ffd400" : "#fff"; // gros yeux
    ctx.beginPath();
    ctx.arc(9, -3, 4, 0, Math.PI * 2);
    ctx.arc(21, -3, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = z.boss ? "#c00" : "#000";
    ctx.fillRect(8, -3, 2, 3);
    ctx.fillRect(20, -3, 2, 3);
    ctx.fillStyle = "#3a1010"; // bouche avec des dents
    ctx.fillRect(9, 4, 12, 4);
    ctx.fillStyle = "#fff";
    ctx.fillRect(10, 4, 3, 2);
    ctx.fillRect(17, 4, 3, 2);
  }

  // Chapeau (pas pour la citrouille, qui a déjà sa queue)
  if (z.type !== "citrouille") {
    ctx.fillStyle = t.couleurChapeau;
    if (t.chapeau === "casquette") {
      ctx.beginPath();
      ctx.arc(15, -1, 11.5, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(15, -4, 17, 3);
    } else if (t.chapeau === "bonnet") {
      ctx.beginPath();
      ctx.arc(15, -1, 11.5, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(15, -14, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (t.chapeau === "haut") {
      ctx.fillRect(2, -13, 26, 3);
      ctx.fillRect(7, -29, 16, 17);
      ctx.fillStyle = "#fff";
      ctx.fillRect(7, -17, 16, 3);
    } else if (t.chapeau === "couronne") {
      ctx.fillStyle = "#f0c020";
      ctx.fillRect(6, -14, 18, 6);
      ctx.beginPath();
      ctx.moveTo(6, -14); ctx.lineTo(6, -21); ctx.lineTo(11, -14);
      ctx.lineTo(15, -22); ctx.lineTo(19, -14);
      ctx.lineTo(24, -21); ctx.lineTo(24, -14);
      ctx.fill();
    }
  }
  // Squelette en feu : des flammes sur la tête et les épaules
  if (z.feu) {
    for (let f = 0; f < 5; f++) {
      const fx = 3 + f * 6;
      const h = 14 + Math.sin(temps / 3 + f * 2 + z.phase) * 5;
      ctx.fillStyle = f % 2 ? "#ffd400" : "#ff6a1a";
      ctx.beginPath();
      ctx.moveTo(fx - 4, -8);
      ctx.lineTo(fx, -8 - h);
      ctx.lineTo(fx + 4, -8);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255, 106, 26, 0.7)";
    ctx.beginPath();
    ctx.arc(2, 14, 6 + Math.sin(temps / 4) * 2, 0, Math.PI * 2);
    ctx.arc(28, 14, 6 + Math.cos(temps / 4) * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ----- Paysages : un nouveau décor à chaque vague -----
const THEMES = [
  { // coucher de soleil
    ciel: ["#c8644a", "#e8a463", "#f3cd8a"], astre: "#f7d56e", lueur: "255, 240, 160",
    nuage: "rgba(120, 80, 70, 0.35)", route: "#b07a4a", trottoir: "#8a8078",
    immeubles: ["#5a4a42", "#6a5a52", "#504038", "#5f4f47"], fenetre: "#ffe98a",
    sol: "#6b4a2b", ombre: "rgba(40, 10, 0, 0.35)", etoiles: false, brouillard: null
  },
  { // nuit avec la lune et les étoiles
    ciel: ["#0b1030", "#1a2050", "#2e3a6e"], astre: "#f4f4e0", lueur: "200, 215, 255",
    nuage: "rgba(20, 20, 50, 0.4)", route: "#4a4a58", trottoir: "#6a6a78",
    immeubles: ["#2a2a3a", "#34344a", "#222232", "#2e2e40"], fenetre: "#ffd86b",
    sol: "#2a2a38", ombre: "rgba(0, 0, 20, 0.45)", etoiles: true, brouillard: null
  },
  { // brume verte
    ciel: ["#4a6a3a", "#7a9a5a", "#b4c88a"], astre: "#e8f0b0", lueur: "230, 255, 170",
    nuage: "rgba(60, 90, 40, 0.35)", route: "#7a7a5a", trottoir: "#8a8a70",
    immeubles: ["#4a5a42", "#56664e", "#3e4e38", "#505f48"], fenetre: "#d6ff8a",
    sol: "#4a4a30", ombre: "rgba(10, 30, 0, 0.35)", etoiles: false, brouillard: "rgba(180, 220, 150, 0.14)"
  },
  { // désert poussiéreux
    ciel: ["#d98a3a", "#f0b860", "#f8e0a0"], astre: "#fff6c0", lueur: "255, 245, 190",
    nuage: "rgba(180, 120, 60, 0.3)", route: "#d0a060", trottoir: "#b09070",
    immeubles: ["#9a6a42", "#a8784c", "#8a5c38", "#a07048"], fenetre: "#ffe9a0",
    sol: "#9a6a3a", ombre: "rgba(80, 40, 0, 0.25)", etoiles: false, brouillard: null
  },
  { // ciel rouge
    ciel: ["#6a1020", "#b02a30", "#e8704a"], astre: "#ff9a5a", lueur: "255, 160, 100",
    nuage: "rgba(60, 10, 20, 0.4)", route: "#6a4a4a", trottoir: "#7a5a5a",
    immeubles: ["#3a2228", "#46292f", "#30181e", "#402630"], fenetre: "#ffb040",
    sol: "#3a2226", ombre: "rgba(40, 0, 10, 0.4)", etoiles: false, brouillard: null
  },
  { // hiver
    ciel: ["#8aa8c8", "#b8d0e4", "#e6f0f8"], astre: "#fffbe0", lueur: "255, 255, 230",
    nuage: "rgba(255, 255, 255, 0.5)", route: "#c8d4dc", trottoir: "#a8b8c4",
    immeubles: ["#6a7a8a", "#74848f", "#5e6e7e", "#6e7e8c"], fenetre: "#ffe9a0",
    sol: "#9aaab8", ombre: "rgba(0, 20, 40, 0.2)", etoiles: false, brouillard: null
  }
];

// À partir de la vague 15 : le manoir sinistre et ténébreux
const THEME_MANOIR = {
  ciel: ["#05020a", "#120818", "#241230"], astre: "#c9c2e0", lueur: "170, 150, 230",
  nuage: "rgba(10, 5, 20, 0.6)", route: "#2a2230", trottoir: "#3c3244",
  immeubles: ["#1a1220", "#221828", "#160e1c", "#1e1424"], fenetre: "#ff9a2a",
  sol: "#140c18", ombre: "rgba(0, 0, 10, 0.6)", etoiles: true, brouillard: "rgba(120, 100, 160, 0.14)"
};

// Dessine le héros avec sa tenue (normale, ninja ou samouraï).
// (x, y) = haut de la tête. Si arme vaut null, on ne dessine pas d'arme (aperçu boutique).
function dessinerHeros(x, y, t, marche, arme) {
  dessinerPersonnage(x, y, t.corps, "#f5c9a0", marche);
  if (t.style === "samourai") {
    ctx.fillStyle = t.accent; // épaulières dorées
    ctx.fillRect(x - 5, y + 10, 10, 6);
    ctx.fillRect(x + 25, y + 10, 10, 6);
  }
  if (t.style === "ninja") {
    ctx.fillStyle = t.casque; // cagoule
    ctx.beginPath();
    ctx.arc(x + 15, y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f5c9a0"; // fente pour les yeux
    ctx.fillRect(x + 5, y - 3, 20, 8);
    ctx.fillStyle = t.accent; // bandeau avec ses deux rubans
    ctx.fillRect(x + 3, y - 9, 24, 4);
    ctx.fillRect(x + 27, y - 8, 9, 2);
    ctx.fillRect(x + 27, y - 5, 7, 2);
    ctx.fillStyle = "#000";
    ctx.fillRect(x + 9, y - 1, 3, 4);
    ctx.fillRect(x + 18, y - 1, 3, 4);
  } else {
    ctx.fillStyle = t.casque; // casque
    ctx.beginPath();
    ctx.arc(x + 15, y, 12, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(x + 1, y - 2, 28, 4);
    if (t.style === "samourai") {
      ctx.fillRect(x + 1, y + 1, 4, 9); // protections des joues
      ctx.fillRect(x + 25, y + 1, 4, 9);
      ctx.fillStyle = t.accent; // les deux cornes dorées
      ctx.beginPath();
      ctx.moveTo(x + 6, y - 9);
      ctx.lineTo(x + 1, y - 24);
      ctx.lineTo(x + 14, y - 11);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + 24, y - 9);
      ctx.lineTo(x + 29, y - 24);
      ctx.lineTo(x + 16, y - 11);
      ctx.fill();
    } else {
      ctx.fillStyle = "#8f84e8"; // reflet sur le casque
      ctx.fillRect(x + 8, y - 8, 6, 3);
    }
    ctx.fillStyle = "#000"; // yeux et sourire
    ctx.fillRect(x + 9, y + 1, 3, 4);
    ctx.fillRect(x + 18, y + 1, 3, 4);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x + 15, y + 5, 4, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }
  // Bras et mains qui tiennent l'arme
  ctx.fillStyle = t.corps;
  ctx.fillRect(x - 5, y + 12, 7, 22);
  ctx.fillRect(x + 28, y + 12, 7, 22);
  ctx.fillStyle = "#f5c9a0";
  ctx.fillRect(x + 12, y + 10, 6, 6);
  if (arme !== null) {
    if (typeof arme === "object") dessinerArmeBoutique(x + 15, y + 12, arme);
    else dessinerArme(x + 15, y + 12, arme);
  }
}

// Dessine une arme achetée dans la boutique
function dessinerArmeBoutique(cx, by, a) {
  ctx.fillStyle = a.couleur;
  ctx.fillRect(cx - a.largeur / 2, by - a.longueur, a.largeur, a.longueur);
  ctx.fillStyle = "#222"; // bout du canon
  ctx.fillRect(cx - a.largeur / 2 - 1, by - a.longueur, a.largeur + 2, 4);
  ctx.fillStyle = "#7a4a22"; // crosse
  ctx.fillRect(cx - 3, by - 2, 7, 10);
}

// Dessine un aperçu du héros dans un petit canvas (pour la boutique)
function apercu(cv, tenue) {
  const principal = ctx;
  ctx = cv.getContext("2d");
  ctx.fillStyle = "#3a2450";
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.save();
  ctx.scale(1.1, 1.1);
  dessinerHeros(10, 26, tenue, 0, null);
  ctx.restore();
  ctx = principal;
}

// Dessine Mevha, le robot géant qui aide le héros
function dessinerMevha(m) {
  const y = SOL - 70;
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.beginPath();
  ctx.ellipse(m.x + 25, y + 72, 30, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#4a5a6a"; // pieds
  ctx.fillRect(m.x + 6, y + 52, 14, 18);
  ctx.fillRect(m.x + 30, y + 52, 14, 18);
  ctx.fillStyle = "#333"; // canons sur les épaules
  ctx.fillRect(m.x - 2, y, 6, 24);
  ctx.fillRect(m.x + 46, y, 6, 24);
  ctx.fillStyle = "#7a8fa6"; // corps
  ctx.beginPath();
  ctx.roundRect(m.x, y + 16, 50, 40, 6);
  ctx.fill();
  ctx.fillStyle = "#2a8fbd"; // écran
  ctx.fillRect(m.x + 15, y + 26, 20, 12);
  ctx.fillStyle = "#ffd400";
  ctx.fillRect(m.x + 20, y + 30, 10, 4);
  ctx.fillStyle = "#9fb4c8"; // tête
  ctx.beginPath();
  ctx.roundRect(m.x + 10, y - 2, 30, 20, 5);
  ctx.fill();
  ctx.fillStyle = "#5ff"; // yeux
  ctx.fillRect(m.x + 16, y + 5, 6, 6);
  ctx.fillRect(m.x + 28, y + 5, 6, 6);
  ctx.fillStyle = "#9fb4c8"; // antenne
  ctx.fillRect(m.x + 24, y - 12, 2, 10);
  ctx.fillStyle = "#e33";
  ctx.beginPath();
  ctx.arc(m.x + 25, y - 13, 3, 0, Math.PI * 2);
  ctx.fill();
}

// Étoiles placées une seule fois au hasard
const etoiles = [];
for (let i = 0; i < 40; i++) {
  etoiles.push({ x: Math.random() * 500, y: Math.random() * 300, p: Math.random() * 10 });
}

function dessiner() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Le décor dépend de la vague
  const th = vague >= 15 ? THEME_MANOIR : THEMES[(Math.max(vague, 1) - 1) % THEMES.length];

  // Ciel
  const ciel = ctx.createLinearGradient(0, 0, 0, canvas.height);
  ciel.addColorStop(0, th.ciel[0]);
  ciel.addColorStop(0.5, th.ciel[1]);
  ciel.addColorStop(1, th.ciel[2]);
  ctx.fillStyle = ciel;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (th.etoiles) {
    etoiles.forEach(function (e) {
      ctx.fillStyle = "rgba(255, 255, 255, " + (0.5 + Math.sin(temps / 20 + e.p) * 0.4) + ")";
      ctx.fillRect(e.x, e.y, 2, 2);
    });
  }
  // Soleil ou lune avec une lueur
  const lueur = ctx.createRadialGradient(400, 90, 10, 400, 90, 110);
  lueur.addColorStop(0, "rgba(" + th.lueur + ", 0.9)");
  lueur.addColorStop(1, "rgba(" + th.lueur + ", 0)");
  ctx.fillStyle = lueur;
  ctx.fillRect(280, 0, 220, 220);
  ctx.fillStyle = th.astre;
  ctx.beginPath();
  ctx.arc(400, 90, 40, 0, Math.PI * 2);
  ctx.fill();
  // Nuages qui avancent doucement
  ctx.fillStyle = th.nuage;
  [0, 1, 2].forEach(function (i) {
    const nx = ((temps * 0.2 + i * 220) % (canvas.width + 200)) - 100;
    const ny = 40 + i * 70;
    ctx.beginPath();
    ctx.ellipse(nx, ny, 55, 14, 0, 0, Math.PI * 2);
    ctx.ellipse(nx + 30, ny - 8, 35, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  // Route au milieu
  ctx.fillStyle = th.route;
  ctx.fillRect(55, 0, canvas.width - 110, canvas.height);

  // Bords de trottoir et lignes de route effacées
  ctx.fillStyle = th.trottoir;
  ctx.fillRect(55, 0, 6, canvas.height);
  ctx.fillRect(canvas.width - 61, 0, 6, canvas.height);
  ctx.fillStyle = "rgba(240, 230, 200, 0.45)";
  for (let ly = 10; ly < canvas.height; ly += 60) {
    ctx.fillRect(canvas.width / 2 - 3, ly, 6, 30);
  }

  // Petits cailloux et débris sur la route
  cailloux.forEach(function (c) {
    ctx.fillStyle = c.couleur;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, c.r, c.r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  // Route fissurée
  ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
  ctx.lineWidth = 2;
  fissures.forEach(function (points) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.forEach(function (p) { ctx.lineTo(Math.max(58, Math.min(canvas.width - 58, p.x)), p.y); });
    ctx.stroke();
  });

  // Immeubles en ruine sur les côtés (hauteur, y de départ, côté)
  const immeubles = [
    { y: 0, h: 150, c: "#5a4a42" }, { y: 160, h: 120, c: "#6a5a52" },
    { y: 290, h: 160, c: "#504038" }, { y: 460, h: 100, c: "#5f4f47" }
  ];
  immeubles.forEach(function (im, idx) {
    [0, canvas.width - 50].forEach(function (x, cote) {
      ctx.fillStyle = th.immeubles[idx];
      ctx.fillRect(x, im.y, 50, im.h);
      // toit abîmé
      ctx.fillStyle = "#3a2e28";
      ctx.fillRect(x, im.y, 50, 6);
      // fenêtres (certaines sont allumées, d'autres cassées)
      for (let fy = im.y + 14; fy < im.y + im.h - 14; fy += 24) {
        for (let fx = 8; fx < 40; fx += 20) {
          ctx.fillStyle = ((fy + fx + cote) % 3 === 0) ? th.fenetre : "#2a2a30";
          ctx.fillRect(x + fx, fy, 12, 14);
        }
      }
    });
  });

  // Sol en bas
  ctx.fillStyle = th.sol;
  ctx.fillRect(0, SOL, canvas.width, canvas.height - SOL);

  // Lampadaires au bord de la route
  [150, 300, 450].forEach(function (y) {
    [68, canvas.width - 68].forEach(function (x) {
      ctx.fillStyle = "rgba(255, 240, 150, 0.35)";
      ctx.beginPath();
      ctx.arc(x, y - 55, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#333";
      ctx.fillRect(x - 3, y - 50, 6, 60);
      ctx.fillStyle = th.fenetre;
      ctx.fillRect(x - 8, y - 62, 16, 12);
    });
  });

  // Zombies, citrouilles et squelettes
  zombies.forEach(function (z) {
    dessinerZombie(z);

    // Barre de vie du boss
    if (z.boss) {
      ctx.fillStyle = "#444";
      ctx.fillRect(z.x, z.y - 30, z.largeur, 6);
      ctx.fillStyle = "#e33";
      ctx.fillRect(z.x, z.y - 30, z.largeur * z.pv / z.pvMax, 6);
    }
  });

  // Armes à ramasser (pistolet gris avec un halo jaune)
  armes.forEach(function (a) {
    ctx.fillStyle = "rgba(255, 230, 0, 0.5)";
    ctx.beginPath();
    ctx.arc(a.x + 15, a.y + 8, 20, 0, Math.PI * 2);
    ctx.fill();
    // On voit la prochaine arme qu'on va gagner
    dessinerArme(a.x + 15, a.y + 22, Math.min(niveauArme + 1, ARMES.length - 1));
  });

  // Bombe à ramasser : boule noire avec le signe jaune et un halo
  if (bombeItem) {
    const halo = 0.4 + Math.sin(temps / 8) * 0.2;
    ctx.fillStyle = "rgba(255, 220, 0, " + halo + ")";
    ctx.beginPath();
    ctx.arc(bombeItem.x, bombeItem.y, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.arc(bombeItem.x, bombeItem.y, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffd400";
    ctx.beginPath();
    ctx.arc(bombeItem.x, bombeItem.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.arc(bombeItem.x, bombeItem.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#8b5a2b"; // mèche
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(bombeItem.x, bombeItem.y - 18);
    ctx.lineTo(bombeItem.x + 6, bombeItem.y - 28);
    ctx.stroke();
  }

  // Boules de feu : orange, ou bleue et géante pour le roi squelette
  boules.forEach(function (b) {
    const halo = b.bleue ? "80, 160, 255" : "255, 140, 30";
    ctx.fillStyle = "rgba(" + halo + ", 0.35)";
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = b.bleue ? "#4a9bff" : "#ff7a1a";
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = b.bleue ? "#d8ecff" : "#ffe27a";
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * 0.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Bombes des squelettes en feu : une zone rouge montre où elles vont tomber
  bombesFeu.forEach(function (b) {
    if (b.t <= b.duree) {
      const u = b.t / b.duree;
      ctx.fillStyle = "rgba(255, 60, 30, " + (0.12 + u * 0.25) + ")";
      ctx.beginPath();
      ctx.arc(b.cx, b.cy, 50, 0, Math.PI * 2);
      ctx.fill();
      const x = b.sx + (b.cx - b.sx) * u;
      const y = b.sy + (b.cy - b.sy) * u - Math.sin(Math.PI * u) * 120; // elle vole en arc
      ctx.fillStyle = "#222";
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffd400"; // mèche allumée
      ctx.beginPath();
      ctx.arc(x + 5, y - 10, 3 + Math.sin(temps) , 0, Math.PI * 2);
      ctx.fill();
    } else {
      const k = 1 - b.explose / 20; // l'explosion grandit puis disparaît
      ctx.fillStyle = "rgba(255, 140, 30, " + (1 - k) * 0.8 + ")";
      ctx.beginPath();
      ctx.arc(b.cx, b.cy, 20 + k * 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 230, 120, " + (1 - k) + ")";
      ctx.beginPath();
      ctx.arc(b.cx, b.cy, (20 + k * 40) * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // Balles
  balles.forEach(function (b) {
    ctx.fillStyle = "rgba(255, 0, 0, 0.35)"; // traînée lumineuse rouge
    ctx.fillRect(b.x - 3, b.y, 6, 24);
    ctx.fillStyle = "#ff2020";
    ctx.fillRect(b.x - 2, b.y, 4, 10);
  });

  if (mevha) dessinerMevha(mevha);

  // Alliés : ils ressemblent au héros avec d'autres couleurs
  allies.forEach(function (a) {
    dessinerPersonnage(a.x, SOL - 50, a.couleur.corps, "#f5c9a0", a.marche);
    ctx.fillStyle = a.couleur.casque;
    ctx.beginPath();
    ctx.arc(a.x + 15, SOL - 50, 12, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(a.x + 1, SOL - 52, 28, 4);
    ctx.fillStyle = "#000";
    ctx.fillRect(a.x + 9, SOL - 49, 3, 4);
    ctx.fillRect(a.x + 18, SOL - 49, 3, 4);
    ctx.fillStyle = "#222";
    ctx.fillRect(a.x + 13, SOL - 66, 5, 26);
  });

  // Héros avec son pistolet
  const marche = (touches["ArrowLeft"] || touches["ArrowRight"]) ? temps / 3 : 0;
  dessinerHeros(joueur.x, SOL - 50, tenueHeros, marche, armeEquipee || niveauArme);

  // Coins sombres pour une ambiance de fin de journée
  const ombre = ctx.createRadialGradient(250, 300, 250, 250, 300, 420);
  ombre.addColorStop(0, "rgba(40, 10, 0, 0)");
  ombre.addColorStop(1, th.ombre);
  ctx.fillStyle = ombre;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (th.brouillard) {
    ctx.fillStyle = th.brouillard;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Compteur de zombies battus, en haut à droite, avec une tête de zombie
  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
  ctx.beginPath();
  ctx.roundRect(canvas.width - 110, 8, 100, 58, 10);
  ctx.fill();
  ctx.fillStyle = "#8fd16a";
  ctx.beginPath();
  ctx.arc(canvas.width - 88, 28, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(canvas.width - 93, 25, 3.5, 0, Math.PI * 2);
  ctx.arc(canvas.width - 83, 25, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#000";
  ctx.fillRect(canvas.width - 94, 25, 2, 3);
  ctx.fillRect(canvas.width - 84, 25, 2, 3);
  ctx.fillStyle = "#3a1010";
  ctx.fillRect(canvas.width - 93, 33, 10, 3);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 22px Arial";
  ctx.textAlign = "left";
  ctx.fillText(zombiesTues, canvas.width - 66, 36);
  ctx.font = "13px Arial";
  ctx.fillStyle = "#ffd400";
  ctx.fillText("Record : " + record, canvas.width - 102, 58);

  // Barre d'expérience du héros, en haut au milieu
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(150, 10, 170, 16);
  ctx.fillStyle = "#4ac8ff";
  ctx.fillRect(150, 10, 170 * xp / xpPourNiveauSuivant(), 16);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 12px Arial";
  ctx.textAlign = "center";
  ctx.fillText("Niveau " + niveauJoueur, 235, 22);

  // Éclair blanc de la super bombe (sans rien de choquant : tout le monde disparaît dans la lumière)
  if (flashBlanc > 0) {
    ctx.fillStyle = "rgba(255, 255, 240, " + flashBlanc + ")";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(255, 200, 0, " + flashBlanc + ")";
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(250, 300, (1 - flashBlanc) * 450, 0, Math.PI * 2);
    ctx.stroke();
    flashBlanc -= 0.015;
  }

  // Bulles de dialogue
  zombies.forEach(function (z) {
    dessinerBulle(z, z.x + z.largeur / 2, z.y - (z.boss ? 36 : 14));
  });
  allies.forEach(function (a) {
    dessinerBulle(a, a.x + a.largeur / 2, SOL - 85);
  });
  if (mevha) dessinerBulle(mevha, mevha.x + mevha.largeur / 2, SOL - 100);
  dessinerBulle(joueurBulle, joueur.x + joueur.largeur / 2, SOL - 100);

  // Bordure rouge qui s'estompe quand le héros est touché
  if (flashRouge > 0) {
    const bord = ctx.createRadialGradient(250, 300, 200, 250, 300, 400);
    bord.addColorStop(0, "rgba(255, 0, 0, 0)");
    bord.addColorStop(1, "rgba(255, 0, 0, " + flashRouge * 0.7 + ")");
    ctx.fillStyle = bord;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    flashRouge -= 0.02;
  }

  // Annonce de la vague
  if (!finDuJeu && zombiesAApparaitre === 0 && zombies.length === 0 && vague > 0) {
    ctx.fillStyle = "#fff";
    ctx.font = "28px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Vague " + vague + " terminée !", canvas.width / 2, 250);
  }

  // Anneau qui grandit autour du héros quand il monte de niveau
  if (animMontee > 0) {
    const r = (40 - animMontee) * 2.5 + 10;
    ctx.strokeStyle = "rgba(74, 200, 255, " + animMontee / 40 + ")";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(joueur.x + joueur.largeur / 2, SOL - 25, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Confettis de fin de niveau
  if (victoire) {
    confettis.forEach(function (c) {
      c.y += c.vy;
      c.x += c.vx + Math.sin(c.y / 20) * 0.8;
      if (c.y > canvas.height) c.y = -10;
      ctx.fillStyle = c.couleur;
      ctx.fillRect(c.x, c.y, c.taille, c.taille * 0.6);
    });
  }

  // Animation de début de niveau : le titre grossit, reste un moment, puis s'efface
  if (animNiveau > 0) {
    const p = 1 - animNiveau / 150; // va de 0 à 1
    const alpha = p < 0.2 ? p / 0.2 : p > 0.8 ? (1 - p) / 0.2 : 1;
    const entree = Math.min(p / 0.3, 1);
    const couleur = COULEURS_NIVEAU[(niveau - 1) % COULEURS_NIVEAU.length];
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, 200, canvas.width, 140);
    ctx.fillStyle = couleur; // deux bandes qui glissent
    ctx.fillRect(0, 198, canvas.width * entree, 4);
    ctx.fillRect(canvas.width * (1 - entree), 338, canvas.width * entree, 4);
    ctx.textAlign = "center";
    ctx.font = "bold " + Math.round(30 + entree * 40) + "px Arial";
    ctx.fillText("NIVEAU " + niveau, canvas.width / 2, 285);
    ctx.fillStyle = "#fff";
    ctx.font = "20px Arial";
    ctx.fillText(hardcore ? "Mode hardcore : attention aux fantômes !" : "Prépare-toi !", canvas.width / 2, 320);
    ctx.restore();
  }

  if (animManoir > 0) dessinerSceneManoir();

  if (finDuJeu) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = "center";
    ctx.fillStyle = "#ff4040";
    ctx.font = "bold 80px Arial";
    ctx.fillText("PERDU", canvas.width / 2, 130);
    ctx.fillStyle = "#fff";
    ctx.font = "26px Arial";
    ctx.fillText("Zombies battus : " + zombiesTues, canvas.width / 2, 230);
    ctx.fillText("Score : " + score, canvas.width / 2, 270);
  }
}

// Remet tout à zéro pour une nouvelle partie
function rejouer() {
  joueur.x = 235;
  balles = [];
  zombies = [];
  armes = [];
  allies = [];
  score = 0;
  zombiesTues = 0;
  vies = 30;
  flashRouge = 0;
  flashBlanc = 0;
  vague = 0;
  zombiesAApparaitre = 0;
  pause = 0;
  prochainZombie = 0;
  niveauArme = 0;
  prochaineArme = 600;
  recharge = 0;
  bombeItem = null;
  bombeDispo = false;
  bombeUtilisee = false;
  // Le niveau du héros (niveauJoueur et xp) n'est plus remis à zéro : il est gardé
  confettis = [];
  animMontee = 0;
  animNiveau = 0;
  animManoir = 0;
  joueurBulle.bulle = null;
  touches = {};
  finDuJeu = false;
  niveau = 1;
  victoire = false;
  enPause = false;
  boules = [];
  bombesFeu = [];
  mevha = null;
  document.getElementById("victoire").style.display = "none";
  document.getElementById("pause").style.display = "none";
  boutonRejouer.style.display = "none";
  boutonMenu.style.display = "none";
  boutonRejouer.blur();
  nouvelleVague();
}

boutonRejouer.addEventListener("click", rejouer);

// ----- Menu : jouer, paramètres, boutique -----
const ecrans = ["ecranMenu", "ecranHistoire", "ecranParametres", "ecranTouches", "ecranBoutique"];

// ----- Touches : on peut changer les touches du jeu -----
// Le jeu garde ses touches d'origine en interne : quand on appuie sur une touche choisie,
// on envoie au jeu la touche d'origine qui correspond.
const ACTIONS_TOUCHES = [
  { id: "gauche", nom: "Gauche / tourner à gauche", defaut: "ArrowLeft" },
  { id: "droite", nom: "Droite / tourner à droite", defaut: "ArrowRight" },
  { id: "avancer", nom: "Avancer (mode histoire)", defaut: "ArrowUp" },
  { id: "reculer", nom: "Reculer (mode histoire)", defaut: "ArrowDown" },
  { id: "tirer", nom: "Tirer", defaut: "Space" },
  { id: "bombe", nom: "Super bombe", defaut: "KeyB" },
  { id: "pleinEcran", nom: "Plein écran", defaut: "KeyF" }
];
let touchesChoisies = {};
let actionEnAttente = null; // l'action qu'on est en train de changer

try {
  const sauveTouches = JSON.parse(localStorage.getItem("touchesZombies"));
  if (sauveTouches && typeof sauveTouches === "object") touchesChoisies = sauveTouches;
} catch (e) {}

function codeDe(action) {
  return touchesChoisies[action.id] || action.defaut;
}

// Le jeu retient la touche par sa place sur le clavier (comme sur un clavier qwerty).
// Pour l'affichage, on garde la lettre qui est vraiment écrite sur ta touche (azerty : A, Z, Q, W...).
let nomsTouches = {};
try {
  const sauveNoms = JSON.parse(localStorage.getItem("nomsTouchesZombies"));
  if (sauveNoms && typeof sauveNoms === "object") nomsTouches = sauveNoms;
} catch (e) {}

function nomDeTouche(code) {
  if (nomsTouches[code]) return nomsTouches[code];
  const noms = { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓", Space: "Espace", ShiftLeft: "Maj", ShiftRight: "Maj", Enter: "Entrée" };
  if (noms[code]) return noms[code];
  if (code.indexOf("Key") === 0) return code.slice(3);
  if (code.indexOf("Digit") === 0) return code.slice(5);
  return code;
}

function afficherTouches() {
  const liste = document.getElementById("listeTouches");
  liste.textContent = "";
  ACTIONS_TOUCHES.forEach(function (action) {
    const ligne = document.createElement("div");
    ligne.className = "ligneArme";
    ligne.appendChild(document.createTextNode(action.nom));
    const bouton = document.createElement("button");
    bouton.className = "moyen";
    bouton.textContent = actionEnAttente === action ? "Appuie sur une touche..." : nomDeTouche(codeDe(action));
    bouton.addEventListener("click", function () {
      actionEnAttente = action;
      document.getElementById("messageTouches").textContent = "Appuie sur la nouvelle touche (Échap pour annuler).";
      afficherTouches();
    });
    ligne.appendChild(bouton);
    liste.appendChild(ligne);
  });
}

function gererTouche(e) {
  if (!e.isTrusted) return; // les touches envoyées par le jeu passent sans changement
  const message = document.getElementById("messageTouches");
  if (e.type === "keydown" && actionEnAttente) { // on choisit la nouvelle touche
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.code !== "Escape") {
      const prise = ACTIONS_TOUCHES.find(function (a) { return a !== actionEnAttente && codeDe(a) === e.code; });
      if (prise) {
        message.textContent = "Cette touche sert déjà pour : " + prise.nom;
      } else {
        touchesChoisies[actionEnAttente.id] = e.code;
        if (e.key.length === 1 && e.key !== " ") nomsTouches[e.code] = e.key.toUpperCase(); // la vraie lettre de la touche
        message.textContent = "Touche changée !";
        try {
          localStorage.setItem("touchesZombies", JSON.stringify(touchesChoisies));
          localStorage.setItem("nomsTouchesZombies", JSON.stringify(nomsTouches));
        } catch (err) {}
      }
    }
    actionEnAttente = null;
    afficherTouches();
    return;
  }
  const action = ACTIONS_TOUCHES.find(function (a) { return codeDe(a) === e.code; });
  if (action && action.defaut !== e.code) { // une touche choisie : on envoie la touche d'origine
    e.preventDefault();
    e.stopImmediatePropagation();
    document.dispatchEvent(new KeyboardEvent(e.type, { code: action.defaut, key: action.defaut, repeat: e.repeat, bubbles: true, cancelable: true }));
    return;
  }
  const ancienne = ACTIONS_TOUCHES.find(function (a) { return a.defaut === e.code && codeDe(a) !== e.code; });
  if (!action && ancienne) { // l'ancienne touche ne sert plus
    e.preventDefault();
    e.stopImmediatePropagation();
  }
}
window.addEventListener("keydown", gererTouche, true);
window.addEventListener("keyup", gererTouche, true);

document.getElementById("boutonTouches").addEventListener("click", function () {
  document.getElementById("messageTouches").textContent = "Clique sur une touche pour la changer.";
  montrer("ecranTouches");
  afficherTouches();
});
document.getElementById("touchesDefaut").addEventListener("click", function () {
  touchesChoisies = {};
  actionEnAttente = null;
  try { localStorage.removeItem("touchesZombies"); } catch (err) {}
  afficherTouches();
});
document.getElementById("retourTouches").addEventListener("click", function () {
  actionEnAttente = null;
  montrer("ecranParametres");
});

function montrer(id) {
  ecrans.forEach(function (e) {
    document.getElementById(e).style.display = e === id ? "flex" : "none";
  });
  document.getElementById("piecesMenu").textContent = pieces;
  document.getElementById("piecesBoutique").textContent = pieces;
  document.getElementById("gemmes").textContent = gemmes;
  document.getElementById("trophees").textContent = trophees;
}

// Lance la partie (normale ou hardcore) : on cache l'accueil
function lancerPartie(modeHardcore) {
  hardcore = modeHardcore;
  animNiveau = 150;
  enAttente = false;
  accueil.style.display = "none";
  initAudio();
}

boutonJouer.addEventListener("click", function () { lancerPartie(false); });
document.getElementById("boutonHardcore").addEventListener("click", function () {
  // On recommence au début avec des fantômes
  rejouer();
  lancerPartie(true);
});

// Plein écran : bouton du menu, ou touche F pendant le jeu
function basculerPleinEcran() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen();
}
document.getElementById("boutonPleinEcran").addEventListener("click", basculerPleinEcran);
document.addEventListener("keydown", function (e) {
  if (e.code === "KeyF") basculerPleinEcran();
});

document.getElementById("boutonHistoire").addEventListener("click", function () {
  montrer("ecranHistoire");
});

document.getElementById("boutonParametres").addEventListener("click", function () {
  montrer("ecranParametres");
});
document.getElementById("boutonBoutique").addEventListener("click", function () {
  montrer("ecranBoutique");
  montrerOnglet("tenues");
  afficherTenues();
});
document.querySelectorAll(".retour").forEach(function (b) {
  b.addEventListener("click", function () { montrer("ecranMenu"); });
});

// Réglage du son et de la luminosité
document.getElementById("reglageSon").addEventListener("input", function (e) {
  volumeGeneral = e.target.value / 100;
  if (sortieSon) sortieSon.gain.value = volumeGeneral * AMPLIFICATION;
});
document.getElementById("reglageLumiere").addEventListener("input", function (e) {
  canvas.style.filter = "brightness(" + e.target.value + "%)";
  document.getElementById("accueil").style.filter = "brightness(" + e.target.value + "%)"; // aussi sur l'accueil
});

// ----- Pièces et tenues -----
let pieces = 0; // gagnées en battant des zombies, gardées dans le navigateur
try {
  pieces = Number(localStorage.getItem("piecesZombies")) || 0;
} catch (e) {}

function gagnerPieces(n) {
  pieces += n;
  try {
    localStorage.setItem("piecesZombies", pieces);
  } catch (e) {}
}

// Trophées (5 par vague) : on peut les échanger contre des gemmes
let trophees = 0;
let gemmes = 0;
let armesAchetees = []; // noms des armes de la boutique déjà achetées
try {
  trophees = Number(localStorage.getItem("tropheesZombies")) || 0;
  gemmes = Number(localStorage.getItem("gemmesZombies")) || 0;
  armesAchetees = JSON.parse(localStorage.getItem("armesAchetees")) || [];
} catch (e) {}

function sauverBoutique() {
  try {
    localStorage.setItem("tropheesZombies", trophees);
    localStorage.setItem("gemmesZombies", gemmes);
    localStorage.setItem("armesAchetees", JSON.stringify(armesAchetees));
  } catch (e) {}
}

function gagnerTrophees(n) {
  trophees += n;
  sauverBoutique();
}

// Armes de la boutique : on les achète avec des gemmes
const ARMES_BOUTIQUE = [
  { nom: "Fusil à pompe", desc: "5 balles en éventail", balles: 5, cadence: 0, eventail: 1.5, degats: 1,
    longueur: 30, largeur: 8, couleur: "#6b4a2b", prix: 300 },
  { nom: "Sniper", desc: "1 balle très forte", balles: 1, cadence: 0, degats: 4,
    longueur: 46, largeur: 4, couleur: "#3a4a3a", prix: 400 },
  { nom: "Pistolet laser", desc: "Tir rapide, reste appuyé", balles: 1, cadence: 5, degats: 1,
    longueur: 22, largeur: 6, couleur: "#2ac0e8", prix: 500 },
  { nom: "Super blaster", desc: "3 balles fortes et rapides", balles: 3, cadence: 8, eventail: 0.8, degats: 2,
    longueur: 36, largeur: 10, couleur: "#c03ae0", prix: 800 }
];

function afficherArmes() {
  const liste = document.getElementById("listeArmes");
  liste.textContent = "";
  // Première ligne : revenir aux armes normales du jeu
  const lignes = [{ nom: "Armes normales", desc: "Celles qu'on ramasse", normale: true }].concat(ARMES_BOUTIQUE);
  lignes.forEach(function (a) {
    const ligne = document.createElement("div");
    ligne.className = "ligneArme";
    ligne.appendChild(document.createTextNode(a.nom + " : " + a.desc));
    const bouton = document.createElement("button");
    const possedee = a.normale || armesAchetees.indexOf(a.nom) >= 0;
    const equipee = a.normale ? armeEquipee === null : armeEquipee === a;
    bouton.textContent = equipee ? "Équipée" : possedee ? "Équiper" : "💎 " + a.prix;
    bouton.addEventListener("click", function () {
      if (!possedee) {
        if (gemmes < a.prix) {
          bouton.textContent = "Pas assez de gemmes";
          return;
        }
        gemmes -= a.prix;
        armesAchetees.push(a.nom);
        sauverBoutique();
      }
      armeEquipee = a.normale ? null : a;
      montrer("ecranBoutique");
      afficherArmes();
    });
    ligne.appendChild(bouton);
    liste.appendChild(ligne);
  });
}

// Quêtes : chacune donne des gemmes une seule fois
const QUETES = [
  { id: "zombies30", nom: "Battre 30 zombies dans une partie", gemmes: 1, ok: function () { return zombiesTues >= 30; } },
  { id: "vague10", nom: "Atteindre la vague 10", gemmes: 2, ok: function () { return vague >= 10; } },
  { id: "bombe", nom: "Utiliser la super bombe", gemmes: 1, ok: function () { return bombeUtilisee; } },
  { id: "manoir", nom: "Entrer dans le manoir (vague 15)", gemmes: 3, ok: function () { return vague >= 15; } },
  { id: "hardcore5", nom: "Atteindre la vague 5 en hardcore", gemmes: 3, ok: function () { return hardcore && vague >= 5; } }
];
let quetesFaites = [];
try {
  quetesFaites = JSON.parse(localStorage.getItem("quetesFaites")) || [];
} catch (e) {}

function verifierQuetes() {
  QUETES.forEach(function (q) {
    if (quetesFaites.indexOf(q.id) >= 0 || !q.ok()) return;
    quetesFaites.push(q.id);
    gemmes += q.gemmes;
    sauverBoutique();
    try {
      localStorage.setItem("quetesFaites", JSON.stringify(quetesFaites));
    } catch (e) {}
    parler(joueurBulle, "Quête réussie ! +" + q.gemmes + " gemme(s)");
  });
}

function afficherQuetes() {
  const liste = document.getElementById("listeQuetes");
  liste.textContent = "";
  QUETES.forEach(function (q) {
    const ligne = document.createElement("div");
    const faite = quetesFaites.indexOf(q.id) >= 0;
    ligne.textContent = (faite ? "✅ " : "⬜ ") + q.nom + " : 💎 " + q.gemmes;
    liste.appendChild(ligne);
  });
}

function montrerOnglet(nom) {
  document.getElementById("listeTenues").style.display = nom === "tenues" ? "flex" : "none";
  document.getElementById("listeArmes").style.display = nom === "armes" ? "flex" : "none";
  document.getElementById("listeQuetes").style.display = nom === "quetes" ? "flex" : "none";
  document.getElementById("tenueDepart").style.display = nom === "tenues" ? "inline-block" : "none";
  if (nom === "armes") afficherArmes();
  if (nom === "quetes") afficherQuetes();
}
document.getElementById("ongletQuetes").addEventListener("click", function () { montrerOnglet("quetes"); });

document.getElementById("ongletTenues").addEventListener("click", function () { montrerOnglet("tenues"); });
document.getElementById("ongletArmes").addEventListener("click", function () { montrerOnglet("armes"); });
document.getElementById("echanger").addEventListener("click", function () {
  if (trophees < 10) return;
  trophees -= 10;
  gemmes++;
  sauverBoutique();
  montrer("ecranBoutique");
});

const TENUE_DEPART = { corps: "#d32f2f", casque: "#6a5acd" };
let tenueHeros = TENUE_DEPART;

const COULEURS_TENUES = [
  { nom: "rouge", hex: "#d32f2f" }, { nom: "bleu", hex: "#2a6fd0" },
  { nom: "vert", hex: "#2e9e4f" }, { nom: "jaune", hex: "#e0b020" },
  { nom: "violet", hex: "#8e44ad" }, { nom: "orange", hex: "#e67e22" },
  { nom: "rose", hex: "#c0398a" }, { nom: "noir", hex: "#2a2a2a" }
];
let tenuesBoutique = [];

const NINJAS = [
  { nom: "Ninja noir", corps: "#222222", casque: "#222222", accent: "#d32f2f" },
  { nom: "Ninja bleu", corps: "#1f3a6e", casque: "#1f3a6e", accent: "#ffd400" },
  { nom: "Ninja vert", corps: "#1f5a35", casque: "#1f5a35", accent: "#ffffff" },
  { nom: "Ninja rouge", corps: "#8a1f1f", casque: "#8a1f1f", accent: "#222222" }
];
const SAMOURAIS = [
  { nom: "Samouraï rouge", corps: "#b02a30", casque: "#7a1a20", accent: "#e8c030" },
  { nom: "Samouraï noir", corps: "#2a2a35", casque: "#15151c", accent: "#e8c030" },
  { nom: "Samouraï bleu", corps: "#2a4f9a", casque: "#1b3166", accent: "#e8c030" },
  { nom: "Samouraï doré", corps: "#c9a227", casque: "#8a6a10", accent: "#d32f2f" }
];

// 4 tenues au hasard (un ninja, un samouraï, deux autres), changées à chaque retour au menu
function nouvellesTenues() {
  const ninja = choisir(NINJAS);
  const samourai = choisir(SAMOURAIS);
  const corps = choisir(COULEURS_TENUES);
  const casque = choisir(COULEURS_TENUES.filter(function (c) { return c !== corps; }));
  const autre = choisir(NINJAS.concat(SAMOURAIS));
  tenuesBoutique = [
    { style: "ninja", corps: ninja.corps, casque: ninja.casque, accent: ninja.accent,
      nom: ninja.nom, prix: (12 + Math.floor(Math.random() * 9)) * 100 },
    { style: "samourai", corps: samourai.corps, casque: samourai.casque, accent: samourai.accent,
      nom: samourai.nom, prix: (15 + Math.floor(Math.random() * 11)) * 100 },
    { corps: corps.hex, casque: casque.hex,
      nom: "Tenue " + corps.nom + " et " + casque.nom, prix: (5 + Math.floor(Math.random() * 11)) * 100 },
    { style: NINJAS.indexOf(autre) >= 0 ? "ninja" : "samourai", corps: autre.corps, casque: autre.casque,
      accent: autre.accent, nom: autre.nom + " (bis)", prix: (14 + Math.floor(Math.random() * 11)) * 100 }
  ];
}

// La boutique change toutes les heures : les tenues et l'heure du dernier changement sont gardées
const UNE_HEURE = 60 * 60 * 1000;
let boutiqueHeure = 0;

function sauverTenues(nouvelles) {
  if (nouvelles) boutiqueHeure = Date.now();
  try {
    localStorage.setItem("boutiqueTenues", JSON.stringify(tenuesBoutique));
    localStorage.setItem("boutiqueHeure", boutiqueHeure);
  } catch (e) {}
}

function chargerBoutique() {
  try {
    const heure = Number(localStorage.getItem("boutiqueHeure"));
    const liste = JSON.parse(localStorage.getItem("boutiqueTenues"));
    if (heure && Date.now() - heure < UNE_HEURE && Array.isArray(liste) && liste.length
        && liste.every(function (t) { return t.prix >= 100; })) { // les anciennes tenues à petit prix sont remplacées
      boutiqueHeure = heure;
      tenuesBoutique = liste;
      return;
    }
  } catch (e) {}
  nouvellesTenues();
  sauverTenues(true);
}

function minutesAvantChangement() {
  return Math.max(0, Math.ceil((boutiqueHeure + UNE_HEURE - Date.now()) / 60000));
}

// Toutes les 30 secondes, on regarde si une heure est passée
setInterval(function () {
  if (Date.now() - boutiqueHeure < UNE_HEURE) return;
  nouvellesTenues();
  sauverTenues(true);
  if (document.getElementById("ecranBoutique").style.display === "flex") afficherTenues();
}, 30000);

function afficherTenues() {
  document.getElementById("renouvellement").textContent = "Nouvelles tenues dans " + minutesAvantChangement() + " min";
  const liste = document.getElementById("listeTenues");
  liste.textContent = "";
  tenuesBoutique.forEach(function (t) {
    const ligne = document.createElement("div");
    ligne.className = "tenue";
    const vue = document.createElement("canvas");
    vue.width = 64;
    vue.height = 90;
    apercu(vue, t);
    ligne.appendChild(vue);
    ligne.appendChild(document.createTextNode(t.nom));
    const achat = document.createElement("button");
    achat.textContent = t.achetee ? "Mettre" : "Acheter (" + t.prix + ")";
    achat.addEventListener("click", function () {
      if (!t.achetee) {
        if (pieces < t.prix) {
          achat.textContent = "Pas assez de pièces";
          return;
        }
        pieces -= t.prix;
        t.achetee = true;
        try {
          localStorage.setItem("piecesZombies", pieces);
        } catch (e) {}
        sauverTenues(false);
      }
      tenueHeros = t;
      montrer("ecranBoutique");
      afficherTenues();
    });
    ligne.appendChild(achat);
    liste.appendChild(ligne);
  });
}

document.getElementById("tenueDepart").addEventListener("click", function () {
  tenueHeros = TENUE_DEPART;
});

// Retour au menu (la boutique ne change plus ici : seulement toutes les heures)
function retourMenu() {
  rejouer();
  enAttente = true;
  modeHistoire = false;
  pauseHistoire = false;
  document.getElementById("pause").style.display = "none";
  montrer("ecranMenu");
  accueil.style.display = "flex";
}

boutonMenu.addEventListener("click", retourMenu);
document.getElementById("boutonPauseMenu").addEventListener("click", retourMenu);

// Bouton pause : visible seulement pendant la partie
const boutonPause = document.getElementById("boutonPause");
boutonPause.addEventListener("click", function () {
  enPause = true;
  boutonPause.blur();
  document.getElementById("pause").style.display = "flex";
});
document.getElementById("boutonReprendre").addEventListener("click", function () {
  enPause = false;
  pauseHistoire = false;
  document.getElementById("pause").style.display = "none";
});
document.getElementById("boutonLobby").addEventListener("click", retourMenu);

// Après la vague 50 : continuer au niveau suivant
document.getElementById("boutonContinuer").addEventListener("click", function () {
  niveau++;
  vague = 0;
  victoire = false;
  confettis = [];
  animNiveau = 150;
  pause = 0;
  document.getElementById("victoire").style.display = "none";
  nouvelleVague();
});

chargerBoutique();
montrer("ecranMenu");

// ----- Mode histoire : la forêt (étape 1) -----
let modeHistoire = false;
let pauseHistoire = false; // vrai quand on a cliqué sur Pause dans le mode histoire

document.getElementById("boutonPauseHistoire").addEventListener("click", function () {
  pauseHistoire = true;
  this.blur();
  document.getElementById("pause").style.display = "flex"; // même menu de pause que le jeu normal
});
const TAILLE_CARTE = 3000; // la carte fait 3000 x 3000 (l'écran n'en montre qu'un morceau)
const DEPART_FORET = { x: 985, y: 1000 }; // au milieu de la carte
const heroForet = { x: DEPART_FORET.x, y: DEPART_FORET.y }; // coin en haut à gauche du héros (il fait 30 x 50)
let tempsForet = 0;
let marcheForet = 0;
let angleForet = -Math.PI / 2; // direction du regard (au début : vers le haut de la carte)

// Les arbres : x, y = pied du tronc, r = taille. Placés "au hasard" mais toujours pareil.
const ARBRES = [];
const COFFRES = [];
const MAISON = { x: 1000, y: 300 }; // la maison de la famille, tout en haut de la carte
let dansMaison = false;             // vrai quand le héros est entré
// Les boss gardent la route vers la maison : il faut les battre pour ouvrir la porte
const BOSS_DEPARTS = [
  { nom: "Gardien de la forêt", x: 450, y: 700, pv: 15, couleur: "#6a3a8a" },
  { nom: "Roi des zombies", x: 970, y: 440, pv: 25, couleur: "#8a2a2a" }
];
// Chapitre 2 : après la maison, la forêt devient rouge et les boss sont plus forts
const BOSS_CHAPITRE2 = [
  { nom: "Le Géant des ombres", x: 450, y: 700, pv: 25, couleur: "#2a2a6a" },
  { nom: "Le Roi du brouillard", x: 970, y: 440, pv: 40, couleur: "#1a5a5a" }
];
// Chapitre 4 : la ville, avec 3 boss dont le chef des zombies
const BOSS_CHAPITRE4 = [
  { nom: "Le Brute", x: 450, y: 700, pv: 30, couleur: "#4a4a4a" },
  { nom: "La Reine des zombies", x: 1600, y: 800, pv: 40, couleur: "#8a2a6a" },
  { nom: "Le Chef des zombies", x: 970, y: 440, pv: 60, couleur: "#1a1a1a" }
];
// Chapitre 5 : le laboratoire, avec le boss final (mêmes endroits que la ville)
const BOSS_CHAPITRE5 = [
  { nom: "Le Robot-garde", x: 450, y: 700, pv: 40, couleur: "#6a7a8a" },
  { nom: "La Mutante", x: 1600, y: 800, pv: 55, couleur: "#2a9a5a" },
  { nom: "Le Docteur Zombie", x: 970, y: 440, pv: 80, couleur: "#e8e8f0" },
  { nom: "Le Kraken géant", x: 1300, y: 1500, pv: 100, couleur: "#5a2a8a", kraken: true } // invoque des mini krakens
];
let chapitre = 1;
(function () {
  let graine = 12345;
  function hasard() { // petit générateur de nombres au hasard
    graine = (graine * 16807) % 2147483647;
    return graine / 2147483647;
  }
  for (let i = 0; i < 200; i++) {
    const a = { x: 30 + hasard() * (TAILLE_CARTE - 60), y: 60 + hasard() * (TAILLE_CARTE - 80), r: 24 + hasard() * 10 };
    // On laisse une clairière vide autour du départ
    if (Math.hypot(a.x - 1000, a.y - 1025) > 130) ARBRES.push(a);
  }
  // Les coffres : on enlève les arbres trop près pour qu'on puisse les atteindre
  for (let i = 0; i < 5; i++) {
    const c = { x: 80 + hasard() * (TAILLE_CARTE - 160), y: 100 + hasard() * (TAILLE_CARTE - 200), ouvert: false };
    if (Math.hypot(c.x - 1000, c.y - 1025) < 200) { i--; continue; } // pas dans la clairière du départ
    COFFRES.push(c);
    for (let j = ARBRES.length - 1; j >= 0; j--) {
      if (Math.hypot(ARBRES[j].x - c.x, ARBRES[j].y - c.y) < 70) ARBRES.splice(j, 1);
    }
  }
  BOSS_DEPARTS.concat(BOSS_CHAPITRE4, BOSS_CHAPITRE5).forEach(function (b) { // et pas d'arbres là où les boss attendent
    for (let j = ARBRES.length - 1; j >= 0; j--) {
      if (Math.hypot(ARBRES[j].x - b.x, ARBRES[j].y - b.y) < 90) ARBRES.splice(j, 1);
    }
  });
  // Pas d'arbres autour de la maison, pour qu'on puisse arriver à la porte
  for (let j = ARBRES.length - 1; j >= 0; j--) {
    if (Math.abs(ARBRES[j].x - MAISON.x) < 150 && Math.abs(ARBRES[j].y - MAISON.y - 40) < 130) ARBRES.splice(j, 1);
  }
  ARBRES.sort(function (a, b) { return a.y - b.y; });
})();

let armesPossedees = [0]; // inventaire : numéros des armes qu'on a (on commence avec le pistolet)
let messageForet = "";
let messageForetTemps = 0;

function ouvrirCoffres() {
  const cx = heroForet.x + 15;
  const cy = heroForet.y + 50;
  COFFRES.forEach(function (c) {
    if (c.ouvert || Math.hypot(cx - c.x, cy - c.y) > 40) return;
    c.ouvert = true;
    const nouvelle = ARMES.findIndex(function (arme, i) { return armesPossedees.indexOf(i) < 0 && arme; });
    if (nouvelle >= 0) {
      armesPossedees.push(nouvelle); // l'arme va dans l'inventaire
      niveauArme = nouvelle;
      messageForet = "Coffre ouvert ! Nouvelle arme : " + ARMES[nouvelle].nom;
    } else {
      messageForet = "Coffre ouvert ! Tu as déjà toutes les armes.";
    }
    messageForetTemps = 180;
    sauverHistoire();
  });
}

// Zombies de la forêt : ils apparaissent de temps en temps et marchent vers le héros
let zombiesForet = [];
let ballesForet = [];
let vieForet = 20;
let prochainZombieForet = 300;
let degatsPauseForet = 0;
let flashForet = 0; // écran rouge quand le héros est touché
let dirForet = { x: 0, y: -1 }; // direction dans laquelle regarde le héros

function creerBossForet() {
  (chapitre === 1 ? BOSS_DEPARTS : chapitre === 2 ? BOSS_CHAPITRE2 : chapitre === 4 ? BOSS_CHAPITRE4 : BOSS_CHAPITRE5).forEach(function (b) {
    zombiesForet.push({ x: b.x, y: b.y, pv: b.pv, pvMax: b.pv, boss: true, nom: b.nom, couleur: b.couleur, kraken: !!b.kraken, invoqueDans: 100, reveille: false, marche: 0 });
  });
}

function bossRestants() {
  return zombiesForet.filter(function (z) { return z.boss; }).length;
}

function apparaitreZombieForet() {
  const angle = Math.random() * Math.PI * 2;
  const x = Math.max(20, Math.min(TAILLE_CARTE - 50, heroForet.x + Math.cos(angle) * 380));
  const y = Math.max(20, Math.min(TAILLE_CARTE - 70, heroForet.y + Math.sin(angle) * 380));
  if (bloqueParArbre(x + 15, y + 50)) return;
  zombiesForet.push({ x: x, y: y, pv: 3, marche: 0 });
}

function tirerForet() {
  const arme = ARMES[niveauArme];
  for (let i = 0; i < arme.balles; i++) {
    const decalage = (i - (arme.balles - 1) / 2) * 10;
    ballesForet.push({
      x: heroForet.x + 15 - dirForet.y * decalage,
      y: heroForet.y + 25 + dirForet.x * decalage,
      dx: dirForet.x * 8, dy: dirForet.y * 8, vie: 50
    });
  }
}

function miseAJourZombiesForet() {
  prochainZombieForet--;
  if (prochainZombieForet <= 0) {
    prochainZombieForet = (240 + Math.random() * 240) * (chapitre >= 2 ? 0.65 : 1); // plus de zombies aux chapitres 2 et 4
    if (zombiesForet.length - bossRestants() < (chapitre >= 2 ? 7 : 5)) apparaitreZombieForet();
  }
  const hx = heroForet.x;
  const hy = heroForet.y;
  zombiesForet.forEach(function (z) {
    const dx = hx - z.x;
    const dy = hy - z.y;
    const d = Math.hypot(dx, dy) || 1;
    z.marche = temps_zf();
    if (z.boss && !z.reveille) { // un boss dort tant que le héros est loin
      if (d < 450) z.reveille = true;
      return;
    }
    if (z.kraken) { // le kraken invoque un mini kraken de temps en temps (5 au maximum)
      z.invoqueDans--;
      const minis = zombiesForet.filter(function (m) { return m.mini; }).length;
      if (z.invoqueDans <= 0 && minis < 5) {
        z.invoqueDans = 150;
        zombiesForet.push({ x: z.x + (Math.random() * 60 - 30), y: z.y + 30, pv: 2, mini: true, marche: 0 });
      }
    }
    const vitesse = z.mini ? 1.4 : z.boss ? 0.7 : 1;
    const nx = z.x + (dx / d) * vitesse;
    if (!bloqueParArbre(nx + 15, z.y + 50)) z.x = nx;
    const ny = z.y + (dy / d) * vitesse;
    if (!bloqueParArbre(z.x + 15, ny + 50)) z.y = ny;
    if (d < (z.kraken ? 80 : z.boss ? 50 : 28) && degatsPauseForet <= 0) { // le zombie touche le héros
      vieForet -= z.boss ? 4 : 2;
      degatsPauseForet = 45;
      flashForet = 10;
    }
  });
  if (degatsPauseForet > 0) degatsPauseForet--;
  if (flashForet > 0) flashForet--;
  ballesForet.forEach(function (b) {
    b.x += b.dx;
    b.y += b.dy;
    b.vie--;
    zombiesForet.forEach(function (z) {
      const grandeur = z.kraken ? 2.6 : z.boss ? 1.8 : 1;
      if (b.vie > 0 && Math.abs(b.x - (z.x + 15)) < 18 * grandeur && Math.abs(b.y - (z.y + 25)) < 28 * grandeur) {
        z.pv--;
        b.vie = 0;
      }
    });
  });
  ballesForet = ballesForet.filter(function (b) { return b.vie > 0; });
  zombiesForet.forEach(function (z) {
    if (z.boss && z.pv <= 0) {
      messageForet = z.nom + " est vaincu !" + (bossRestants() === 1 ? " La porte de la maison s'ouvre !" : "");
      messageForetTemps = 240;
    }
  });
  zombiesForet = zombiesForet.filter(function (z) { return z.pv > 0; });
  if (vieForet <= 0) { // le héros est vaincu : il revient au départ
    vieForet = 20;
    zombiesForet = [];
    creerBossForet();
    ballesForet = [];
    heroForet.x = DEPART_FORET.x;
    heroForet.y = DEPART_FORET.y;
    messageForet = "Tu es tombé... Tu repars du début de la forêt.";
    messageForetTemps = 180;
  }
}

function temps_zf() { return tempsForet / 4; }

function bloqueParArbre(px, py) {
  // Les murs de la maison bloquent aussi (la porte est devant, au sud)
  if (Math.abs(px - MAISON.x) < 88 && py > MAISON.y - 40 && py < MAISON.y + 8) return true;
  return ARBRES.some(function (a) {
    return Math.hypot(px - a.x, py - a.y) < a.r * 0.6 + 8;
  });
}

function miseAJourForet() {
  if (dansMaison) return; // dans la maison, plus rien ne bouge
  tempsForet++;
  // Première personne : gauche/droite tournent, haut/bas avancent et reculent
  if (touches["ArrowLeft"]) angleForet -= 0.04;
  if (touches["ArrowRight"]) angleForet += 0.04;
  dirForet = { x: Math.cos(angleForet), y: Math.sin(angleForet) };
  let avance = 0;
  if (touches["ArrowUp"]) avance += 3;
  if (touches["ArrowDown"]) avance -= 2;
  const dx = dirForet.x * avance;
  const dy = dirForet.y * avance;
  // On teste chaque direction séparément pour pouvoir glisser le long d'un arbre
  const nx = Math.max(0, Math.min(TAILLE_CARTE - 30, heroForet.x + dx));
  if (!bloqueParArbre(nx + 15, heroForet.y + 50)) heroForet.x = nx;
  const ny = Math.max(0, Math.min(TAILLE_CARTE - 50, heroForet.y + dy));
  if (!bloqueParArbre(heroForet.x + 15, ny + 50)) heroForet.y = ny;
  ouvrirCoffres();
  // Devant la porte : le héros entre dans la maison
  if (Math.hypot(heroForet.x + 15 - MAISON.x, heroForet.y + 50 - (MAISON.y + 30)) < 40) {
    if (bossRestants() === 0) {
      dansMaison = true;
      return;
    }
    messageForet = "La porte est fermée ! Bats les boss d'abord (" + bossRestants() + " restants).";
    messageForetTemps = 90;
  }
  miseAJourZombiesForet();
  if (messageForetTemps > 0) messageForetTemps--;
}

// Vue à la première personne : on dessine chaque objet selon sa distance et son angle
const CHAMP = Math.PI / 3; // champ de vision : 60 degrés
const HAUT_YEUX = 30;      // hauteur des yeux du héros

// Commence un chapitre où l'on marche (2 : la forêt rouge, 4 : la ville). Le héros garde ses armes.
function commencerChapitreForet(numero, message) {
  chapitre = numero;
  dansMaison = false;
  heroForet.x = DEPART_FORET.x;
  heroForet.y = DEPART_FORET.y;
  angleForet = -Math.PI / 2;
  vieForet = 20;
  zombiesForet = [];
  creerBossForet();
  ballesForet = [];
  COFFRES.forEach(function (c) { c.ouvert = false; });
  messageForet = message;
  messageForetTemps = 240;
  sauverHistoire();
}

// L'intérieur de la maison : le héros retrouve sa famille
function dessinerMaison() {
  const L = canvas.width;
  ctx.fillStyle = "#5a3a22"; // mur
  ctx.fillRect(0, 0, L, 380);
  ctx.fillStyle = "#3a2414"; // plancher
  ctx.fillRect(0, 380, L, 220);
  ctx.fillStyle = "#2a8fbd"; // fenêtre avec la lune
  ctx.fillRect(190, 70, 120, 110);
  ctx.fillStyle = "#e8e8f0";
  ctx.beginPath();
  ctx.arc(250, 120, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3a2414";
  ctx.fillRect(247, 70, 6, 110);
  ctx.fillRect(190, 122, 120, 6);
  ctx.fillStyle = "#ff9a2a"; // bougies
  ctx.fillRect(60, 300, 8, 30);
  ctx.fillRect(432, 300, 8, 30);
  ctx.beginPath();
  ctx.arc(64, 292, 7, 0, Math.PI * 2);
  ctx.arc(436, 292, 7, 0, Math.PI * 2);
  ctx.fill();
  // La famille : papa, maman et le petit frère, qui sourient
  const famille = [
    { x: 150, corps: "#2a5a9a", haut: 90 },
    { x: 250, corps: "#b03a5a", haut: 85 },
    { x: 340, corps: "#3a9a5a", haut: 55 }
  ];
  famille.forEach(function (p) {
    const pied = 440;
    ctx.fillStyle = "#333"; // jambes
    ctx.fillRect(p.x - 10, pied - p.haut * 0.35, 20, p.haut * 0.35);
    ctx.fillStyle = p.corps;
    ctx.fillRect(p.x - 14, pied - p.haut * 0.75, 28, p.haut * 0.42);
    ctx.fillStyle = "#f5c9a0"; // tête
    ctx.beginPath();
    ctx.arc(p.x, pied - p.haut * 0.85, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000"; // yeux et sourire
    ctx.fillRect(p.x - 6, pied - p.haut * 0.88, 3, 3);
    ctx.fillRect(p.x + 3, pied - p.haut * 0.88, 3, 3);
    ctx.beginPath();
    ctx.arc(p.x, pied - p.haut * 0.83, 5, 0, Math.PI);
    ctx.stroke();
    ctx.fillStyle = "#ff4060"; // cœur
    ctx.font = "20px Arial";
    ctx.textAlign = "center";
    ctx.fillText("♥", p.x, pied - p.haut - 12);
  });
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(30, 480, L - 60, 90);
  ctx.fillStyle = "#ffd400";
  ctx.font = "22px Arial";
  ctx.fillText(chapitre === 1 ? "Tu as retrouvé ta famille !" : chapitre === 2 ? "Bravo, les boss sont vaincus !" : chapitre === 4 ? "Un message radio !" : "FIN : tu as sauvé le monde !", L / 2, 515);
  ctx.fillStyle = "#fff";
  ctx.font = "15px Arial";
  if (chapitre === 5) {
    ctx.fillText("Le Docteur Zombie est vaincu : plus aucun zombie, ta famille est libre.", L / 2, 540);
    ctx.fillText("Merci d'avoir joué ! Échap : retour au menu", L / 2, 560);
  } else if (chapitre === 4) {
    ctx.fillText("« Le Docteur Zombie se cache au laboratoire. Arrête-le ! »", L / 2, 540);
    ctx.fillText("Entrée : chapitre 5 | Échap : menu", L / 2, 560);
  } else if (chapitre === 1) {
    ctx.fillText("Mais un brouillard rouge se lève dehors...", L / 2, 540);
    ctx.fillText("Entrée : chapitre 2 | Échap : menu", L / 2, 560);
  } else {
    ctx.fillText("Mais la route vers la ville est pleine de zombies...", L / 2, 540);
    ctx.fillText("Entrée : chapitre 3 | Échap : menu", L / 2, 560);
  }
}

// Des étoiles placées au hasard dans le ciel (toujours les mêmes pendant la partie), qui brillent doucement
const ETOILES = [];
for (let i = 0; i < 70; i++) {
  ETOILES.push({ x: Math.random(), y: Math.random(), taille: 1 + Math.random() * 2, phase: Math.random() * 6 });
}

function dessinerEtoiles(L, horizon, decalage) {
  ETOILES.forEach(function (e) {
    const x = (((e.x * L - decalage) % L) + L) % L; // elles défilent quand on tourne la tête
    ctx.globalAlpha = 0.5 + Math.sin(tempsForet / 20 + e.phase) * 0.4;
    ctx.fillStyle = "#fff";
    ctx.fillRect(x, e.y * (horizon - 20), e.taille, e.taille);
  });
  ctx.globalAlpha = 1;
}

// Une arme vue de derrière, tenue par le héros : un dessin différent pour chaque arme
function pistoletForet(x, bas) {
  ctx.fillStyle = "#6b4a2b"; // crosse en bois
  ctx.fillRect(x - 9, bas - 50, 18, 50);
  ctx.fillStyle = "#8a8a94"; // culasse
  ctx.fillRect(x - 11, bas - 110, 22, 62);
  ctx.fillStyle = "#c8c8d0"; // reflet sur le dessus
  ctx.fillRect(x - 11, bas - 110, 6, 62);
  ctx.fillStyle = "#222"; // bouche du canon
  ctx.fillRect(x - 5, bas - 118, 10, 10);
  ctx.fillStyle = "#f5c9a0"; // main
  ctx.fillRect(x - 13, bas - 30, 26, 30);
}

function dessinerArmeForet(L, H, niveau) {
  const x = L / 2 + 70;
  const bas = H;
  if (niveau === 0) { // Pistolet
    pistoletForet(x, bas);
  } else if (niveau === 1) { // Double pistolet : un dans chaque main
    pistoletForet(L / 2 - 70, bas);
    pistoletForet(L / 2 + 70, bas);
  } else if (niveau === 2) { // AK-47 : crosse en bois, chargeur courbe, long canon
    ctx.fillStyle = "#7a4a22"; // crosse
    ctx.fillRect(x - 12, bas - 70, 24, 70);
    ctx.fillStyle = "#3a3a3a"; // corps métal
    ctx.fillRect(x - 14, bas - 150, 28, 85);
    ctx.fillStyle = "#222"; // chargeur courbe
    ctx.fillRect(x + 12, bas - 120, 12, 40);
    ctx.fillRect(x + 18, bas - 85, 12, 25);
    ctx.fillStyle = "#7a4a22"; // garde-main en bois
    ctx.fillRect(x - 10, bas - 200, 20, 55);
    ctx.fillStyle = "#555"; // long canon
    ctx.fillRect(x - 4, bas - 235, 8, 40);
    ctx.fillStyle = "#222"; // guidon
    ctx.fillRect(x - 6, bas - 245, 12, 10);
    ctx.fillStyle = "#f5c9a0"; // main
    ctx.fillRect(x - 14, bas - 40, 28, 30);
  } else { // Mitraillette : noire et orange, avec un gros chargeur rond
    ctx.fillStyle = "#1a1a1e"; // corps
    ctx.fillRect(x - 18, bas - 170, 36, 130);
    ctx.fillStyle = "#f08a24"; // bandes orange
    ctx.fillRect(x - 18, bas - 150, 36, 8);
    ctx.fillRect(x - 18, bas - 100, 36, 8);
    ctx.fillStyle = "#333"; // chargeur rond
    ctx.beginPath();
    ctx.arc(x + 34, bas - 90, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f08a24";
    ctx.beginPath();
    ctx.arc(x + 34, bas - 90, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#444"; // canon avec trous de refroidissement
    ctx.fillRect(x - 8, bas - 215, 16, 50);
    ctx.fillStyle = "#111";
    ctx.fillRect(x - 4, bas - 205, 8, 4);
    ctx.fillRect(x - 4, bas - 193, 8, 4);
    ctx.fillRect(x - 4, bas - 181, 8, 4);
    ctx.fillStyle = "#f5c9a0"; // main
    ctx.fillRect(x - 16, bas - 50, 32, 30);
  }
}

function dessinerForet() {
  if (dansMaison) {
    dessinerMaison();
    return;
  }
  const L = canvas.width;
  const H = canvas.height;
  const horizon = H / 2;
  const f = (L / 2) / Math.tan(CHAMP / 2); // taille à l'écran d'un objet à la distance 1
  ctx.globalAlpha = 1;
  const ciel = ctx.createLinearGradient(0, 0, 0, horizon);
  ciel.addColorStop(0, chapitre === 1 ? "#03040c" : chapitre === 2 ? "#1a0408" : chapitre === 5 ? "#04100c" : "#080c14");
  ciel.addColorStop(1, chapitre === 1 ? "#141a30" : chapitre === 2 ? "#4a1020" : chapitre === 5 ? "#0c4a3a" : "#2a3446");
  ctx.fillStyle = ciel;
  ctx.fillRect(0, 0, L, horizon);
  dessinerEtoiles(L, horizon, angleForet * 250);
  ctx.fillStyle = chapitre === 1 ? "#e8e8f0" : "#d04040"; // la lune (rouge au chapitre 2)
  ctx.beginPath();
  // La lune reste à sa place dans le ciel : elle défile comme les étoiles quand on tourne la tête
  ctx.arc((((420 - angleForet * 250) % L) + L) % L, 90, 22, 0, Math.PI * 2);
  ctx.fill();
  const sol = ctx.createLinearGradient(0, horizon, 0, H);
  sol.addColorStop(0, chapitre === 1 ? "#0c1a10" : chapitre === 2 ? "#1a0c0c" : chapitre === 5 ? "#102220" : "#14161c");
  sol.addColorStop(1, chapitre === 1 ? "#1f4026" : chapitre === 2 ? "#3a1a1a" : chapitre === 5 ? "#2e5450" : "#30333c");
  ctx.fillStyle = sol;
  ctx.fillRect(0, horizon, L, H - horizon);

  const cx = heroForet.x + 15;
  const cy = heroForet.y + 50;
  const fx = Math.cos(angleForet);
  const fy = Math.sin(angleForet);
  // Liste de tout ce qu'il y a devant nous : arbres, coffres, zombies, balles
  const objets = [];
  function ajouter(type, o, ox, oy) {
    const vx = ox - cx;
    const vy = oy - cy;
    const dist = vx * fx + vy * fy;          // distance devant nous
    const cote = -vx * fy + vy * fx;         // décalage vers la droite
    if (dist < 12 || dist > 900) return;
    if (Math.abs(cote / dist) > Math.tan(CHAMP / 2) + 0.4) return; // hors de l'écran
    objets.push({ type: type, o: o, dist: dist, sx: L / 2 + (cote / dist) * f, s: f / dist });
  }
  ajouter("maison", MAISON, MAISON.x, MAISON.y);
  ARBRES.forEach(function (a) { ajouter("arbre", a, a.x, a.y); });
  COFFRES.forEach(function (c) { ajouter("coffre", c, c.x, c.y); });
  zombiesForet.forEach(function (z) { ajouter(z.kraken || z.mini ? "kraken" : "zombie", z, z.x + 15, z.y + 50); });
  ballesForet.forEach(function (b) { ajouter("balle", b, b.x, b.y); });
  objets.sort(function (a, b) { return b.dist - a.dist; }); // les plus loin d'abord

  objets.forEach(function (ob) {
    let s = ob.s;
    const pied = horizon + HAUT_YEUX * s; // où l'objet touche le sol à l'écran
    ctx.globalAlpha = Math.max(0.05, Math.min(1, 1.2 - ob.dist / 800)); // brouillard
    if (ob.type === "maison") {
      ctx.fillStyle = "#6a4a30"; // murs
      ctx.fillRect(ob.sx - 80 * s, pied - 90 * s, 160 * s, 90 * s);
      ctx.fillStyle = "#3a1a14"; // toit
      ctx.beginPath();
      ctx.moveTo(ob.sx - 95 * s, pied - 90 * s);
      ctx.lineTo(ob.sx, pied - 150 * s);
      ctx.lineTo(ob.sx + 95 * s, pied - 90 * s);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ffb84a"; // fenêtres allumées
      ctx.fillRect(ob.sx - 62 * s, pied - 65 * s, 28 * s, 28 * s);
      ctx.fillRect(ob.sx + 34 * s, pied - 65 * s, 28 * s, 28 * s);
      ctx.fillStyle = "#2a1408"; // porte
      ctx.fillRect(ob.sx - 14 * s, pied - 50 * s, 28 * s, 50 * s);
      ctx.fillStyle = "#ffd400";
      ctx.fillRect(ob.sx + 7 * s, pied - 26 * s, 4 * s, 4 * s);
    } else if (ob.type === "arbre" && chapitre === 5) { // au laboratoire : des tubes de verre qui brillent
      const r = ob.o.r;
      const hauteur = 110 + r * 3;
      ctx.fillStyle = "#3a4a4a"; // socle
      ctx.fillRect(ob.sx - 22 * s, pied - 12 * s, 44 * s, 12 * s);
      ctx.fillStyle = "rgba(60, 255, 176, 0.55)"; // tube lumineux
      ctx.fillRect(ob.sx - 16 * s, pied - hauteur * s, 32 * s, (hauteur - 12) * s);
      ctx.fillStyle = "rgba(200, 255, 230, 0.7)"; // reflet
      ctx.fillRect(ob.sx - 10 * s, pied - (hauteur - 10) * s, 5 * s, (hauteur - 30) * s);
      ctx.fillStyle = "#3a4a4a"; // couvercle
      ctx.fillRect(ob.sx - 22 * s, pied - (hauteur + 8) * s, 44 * s, 10 * s);
    } else if (ob.type === "arbre" && chapitre === 4) { // dans la ville, ce sont des immeubles
      const r = ob.o.r;
      const largeur = r * 2.6;
      const hauteur = 90 + r * 5;
      ctx.fillStyle = "#2a2e3a";
      ctx.fillRect(ob.sx - largeur / 2 * s, pied - hauteur * s, largeur * s, hauteur * s);
      ctx.fillStyle = "#1c2028"; // toit
      ctx.fillRect(ob.sx - largeur / 2 * s, pied - hauteur * s, largeur * s, 6 * s);
      for (let ligne = 0; ligne < 4; ligne++) { // fenêtres, certaines allumées
        for (let col = 0; col < 3; col++) {
          const allumee = (Math.floor(ob.o.x) + ligne * 3 + col) % 3 === 0;
          ctx.fillStyle = allumee ? "#ffd070" : "#14161c";
          ctx.fillRect(ob.sx - largeur / 2 * s + (6 + col * (largeur / 3)) * s, pied - (hauteur - 14 - ligne * 28) * s, 10 * s, 14 * s);
        }
      }
    } else if (ob.type === "arbre") {
      const r = ob.o.r;
      ctx.fillStyle = "#4a2e18"; // tronc
      ctx.fillRect(ob.sx - 6 * s, pied - 45 * s, 12 * s, 45 * s);
      ctx.fillStyle = "#17401f"; // feuilles
      ctx.beginPath();
      ctx.arc(ob.sx, pied - (45 + r * 0.8) * s, r * 1.5 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1f5a2b";
      ctx.beginPath();
      ctx.arc(ob.sx - r * 0.4 * s, pied - (50 + r) * s, r * 0.9 * s, 0, Math.PI * 2);
      ctx.fill();
    } else if (ob.type === "kraken") { // le kraken géant ou un mini kraken, vus de face
      const z = ob.o;
      const u = s * (z.kraken ? 2.6 : 0.8);
      ctx.lineCap = "round";
      ctx.lineWidth = 7 * u;
      ctx.strokeStyle = z.kraken ? "#5a2a8a" : "#a05ad0";
      for (let i = 0; i < 5; i++) { // tentacules qui ondulent
        const x0 = ob.sx + (i - 2) * 11 * u;
        ctx.beginPath();
        ctx.moveTo(x0, pied - 45 * u);
        ctx.quadraticCurveTo(x0 + Math.sin(tempsForet / 6 + i) * 9 * u, pied - 22 * u, x0 + Math.sin(tempsForet / 5 + i * 2) * 8 * u, pied);
        ctx.stroke();
      }
      ctx.fillStyle = z.kraken ? "#5a2a8a" : "#b878e0"; // tête
      ctx.beginPath();
      ctx.ellipse(ob.sx, pied - 68 * u, 32 * u, 28 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff"; // yeux
      ctx.beginPath();
      ctx.arc(ob.sx - 12 * u, pied - 66 * u, 8 * u, 0, Math.PI * 2);
      ctx.arc(ob.sx + 12 * u, pied - 66 * u, 8 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = z.kraken ? "#e22" : "#111";
      ctx.beginPath();
      ctx.arc(ob.sx - 12 * u, pied - 64 * u, 4 * u, 0, Math.PI * 2);
      ctx.arc(ob.sx + 12 * u, pied - 64 * u, 4 * u, 0, Math.PI * 2);
      ctx.fill();
      if (z.kraken) { // barre de vie du kraken
        ctx.fillStyle = "#222";
        ctx.fillRect(ob.sx - 40, pied - 105 * u, 80, 6);
        ctx.fillStyle = "#e33";
        ctx.fillRect(ob.sx - 40, pied - 105 * u, 80 * Math.max(0, z.pv) / z.pvMax, 6);
      }
    } else if (ob.type === "coffre") {
      const c = ob.o;
      ctx.fillStyle = c.ouvert ? "#4a3018" : "#8b5a2b"; // caisse
      ctx.fillRect(ob.sx - 18 * s, pied - 20 * s, 36 * s, 20 * s);
      if (c.ouvert) {
        ctx.fillStyle = "#2a1a0c"; // couvercle levé
        ctx.fillRect(ob.sx - 18 * s, pied - 38 * s, 36 * s, 8 * s);
      } else {
        ctx.fillStyle = "#a06a30"; // couvercle fermé
        ctx.fillRect(ob.sx - 18 * s, pied - 30 * s, 36 * s, 12 * s);
        ctx.fillStyle = "#ffd400"; // serrure et bandes dorées
        ctx.fillRect(ob.sx - 4 * s, pied - 24 * s, 8 * s, 8 * s);
        ctx.fillRect(ob.sx - 18 * s, pied - 30 * s, 4 * s, 30 * s);
        ctx.fillRect(ob.sx + 14 * s, pied - 30 * s, 4 * s, 30 * s);
      }
    } else if (ob.type === "zombie") {
      const z = ob.o;
      const s0 = s;
      if (z.boss) { // un boss est presque deux fois plus grand
        s = s0 * 1.8;
        ctx.fillStyle = "#222"; // barre de vie au-dessus de sa tête
        ctx.fillRect(ob.sx - 30, pied - 125 * s, 60, 6);
        ctx.fillStyle = "#e33";
        ctx.fillRect(ob.sx - 30, pied - 125 * s, 60 * Math.max(0, z.pv) / z.pvMax, 6);
      }
      // Animation : les jambes se lèvent chacune leur tour, les bras tendus montent et descendent
      const pas = Math.sin(z.marche * 2 + z.x * 0.1);
      const bob = Math.abs(pas) * 3 * s; // le corps monte et descend en marchant
      const ville = chapitre === 4 || chapitre === 5; // en ville et au labo : combinaison orange
      ctx.fillStyle = ville ? "#c86a10" : "#3a4a5a"; // jambes
      ctx.fillRect(ob.sx - 11 * s, pied - 22 * s - Math.max(0, pas) * 7 * s, 9 * s, 22 * s);
      ctx.fillRect(ob.sx + 2 * s, pied - 22 * s - Math.max(0, -pas) * 7 * s, 9 * s, 22 * s);
      ctx.fillStyle = z.boss ? z.couleur : ville ? "#e07a14" : "#5a8a3a"; // corps
      ctx.fillRect(ob.sx - 14 * s, pied - 48 * s - bob, 28 * s, 28 * s);
      ctx.fillRect(ob.sx - 26 * s, pied - 46 * s - bob - pas * 6 * s, 12 * s, 6 * s); // bras tendus
      ctx.fillRect(ob.sx + 14 * s, pied - 46 * s - bob + pas * 6 * s, 12 * s, 6 * s);
      ctx.fillStyle = ville ? "#9aa0a8" : "#8fd16a"; // tête
      ctx.beginPath();
      ctx.arc(ob.sx + pas * 2 * s, pied - 58 * s - bob, 11 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#c00"; // yeux
      ctx.fillRect(ob.sx - 6 * s + pas * 2 * s, pied - 61 * s - bob, 4 * s, 4 * s);
      ctx.fillRect(ob.sx + 2 * s + pas * 2 * s, pied - 61 * s - bob, 4 * s, 4 * s);
    } else {
      ctx.fillStyle = "#ff4040"; // balle
      ctx.beginPath();
      ctx.arc(ob.sx, horizon + (HAUT_YEUX - 30) * s, Math.max(2, 4 * s), 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.globalAlpha = 1;
  dessinerArmeForet(L, H, niveauArme); // l'arme du héros en bas de l'écran
  ctx.strokeStyle = "#fff"; // viseur
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(L / 2 - 10, horizon); ctx.lineTo(L / 2 + 10, horizon);
  ctx.moveTo(L / 2, horizon - 10); ctx.lineTo(L / 2, horizon + 10);
  ctx.stroke();
  if (flashForet > 0) {
    ctx.fillStyle = "rgba(255, 0, 0, " + flashForet * 0.04 + ")"; // écran rouge quand on est touché
    ctx.fillRect(0, 0, L, H);
  }
  // Inventaire : une case par arme, la case dorée est l'arme en main
  ARMES.forEach(function (a, i) {
    const x = L / 2 - 2 * 62 + i * 62 + 3;
    const aEnMain = i === niveauArme;
    const possedee = armesPossedees.indexOf(i) >= 0;
    ctx.fillStyle = possedee ? "rgba(0, 0, 0, 0.65)" : "rgba(0, 0, 0, 0.3)";
    ctx.fillRect(x, 535, 56, 36);
    ctx.strokeStyle = aEnMain ? "#ffd400" : "#888";
    ctx.lineWidth = aEnMain ? 3 : 1;
    ctx.strokeRect(x, 535, 56, 36);
    ctx.fillStyle = possedee ? "#fff" : "#666";
    ctx.font = "11px Arial";
    ctx.textAlign = "center";
    ctx.fillText((i + 1) + " " + (possedee ? a.nom.slice(0, 8) : "vide"), x + 28, 557);
  });
  ctx.fillStyle = "#fff";
  ctx.font = "14px Arial";
  ctx.textAlign = "center";
  ctx.fillText("← → : tourner | ↑ ↓ : avancer, reculer | Espace : tirer | Échap : menu", canvas.width / 2, 590);
  const ouverts = COFFRES.filter(function (c) { return c.ouvert; }).length;
  ctx.fillText("Coffres : " + ouverts + "/" + COFFRES.length + " | Arme : " + ARMES[niveauArme].nom + " | Vie : " + vieForet, canvas.width / 2, 20);
  if (messageForetTemps > 0) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(40, 50, canvas.width - 80, 34);
    ctx.fillStyle = "#ffd400";
    ctx.font = "16px Arial";
    ctx.fillText(messageForet, canvas.width / 2, 72);
  }
}

// Progression du mode histoire : le chapitre et les armes sont gardés dans le navigateur
function sauverHistoire() {
  try {
    localStorage.setItem("histoireZombies", JSON.stringify({ chapitre: chapitre, armes: armesPossedees, arme: niveauArme }));
  } catch (e) {}
}

function chargerHistoire() {
  try {
    const s = JSON.parse(localStorage.getItem("histoireZombies"));
    if (s && s.chapitre >= 1 && s.chapitre <= 5 && Array.isArray(s.armes)) return s;
  } catch (e) {}
  return null;
}

function montrerBoutonContinuer() {
  const s = chargerHistoire();
  const bouton = document.getElementById("continuerHistoire");
  bouton.style.display = s ? "block" : "none";
  if (s) bouton.textContent = "Continuer (chapitre " + s.chapitre + ")";
}

document.getElementById("boutonHistoire").addEventListener("click", montrerBoutonContinuer);

document.getElementById("continuerHistoire").addEventListener("click", function () {
  const s = chargerHistoire();
  lancerHistoire();
  if (!s) return;
  armesPossedees = s.armes;
  niveauArme = s.arme;
  if (s.chapitre === 3) demarrerRoute();
  else if (s.chapitre > 1) commencerChapitreForet(s.chapitre, "Ta partie est reprise : chapitre " + s.chapitre);
  sauverHistoire();
});

document.getElementById("commencerHistoire").addEventListener("click", function () {
  lancerHistoire();
  sauverHistoire(); // nouvelle partie : on repart du chapitre 1
});

function lancerHistoire() {
  modeHistoire = true;
  heroForet.x = DEPART_FORET.x;
  heroForet.y = DEPART_FORET.y;
  niveauArme = 0;
  armesPossedees = [0];
  chapitre = 1;
  angleForet = -Math.PI / 2;
  dansMaison = false;
  vieForet = 20;
  zombiesForet = [];
  creerBossForet();
  ballesForet = [];
  prochainZombieForet = 300;
  COFFRES.forEach(function (c) { c.ouvert = false; });
  messageForetTemps = 0;
  accueil.style.display = "none";
  initAudio();
}

document.addEventListener("keydown", function (e) {
  if (!modeHistoire) return;
  if (e.code.indexOf("Arrow") === 0) e.preventDefault();
  if (e.code === "Space" && !e.repeat && !pauseHistoire && chapitre === 3) tirerRoute();
  else if (e.code === "Space" && !e.repeat && !pauseHistoire && !dansMaison) tirerForet();
  if (e.code === "Enter" && dansMaison && chapitre === 2) demarrerRoute(); // la suite : chapitre 3
  // Inventaire : les touches 1 à 4 choisissent l'arme
  const numero = e.code.indexOf("Digit") === 0 ? Number(e.code.slice(5)) - 1 : -1;
  if (numero >= 0 && armesPossedees.indexOf(numero) >= 0) niveauArme = numero;
  if (e.code === "Enter" && dansMaison && chapitre === 1) {
    commencerChapitreForet(2, "Chapitre 2 : bats les 2 nouveaux boss et retourne à la maison !");
  }
  if (e.code === "Enter" && dansMaison && chapitre === 4) {
    commencerChapitreForet(5, "Chapitre 5 : le laboratoire ! Bats les 4 boss, dont le Kraken géant.");
  }
  if (e.code === "Enter" && chapitre === 3 && route.fini) {
    commencerChapitreForet(4, "Chapitre 4 : la ville ! Bats les 3 boss pour atteindre l'abri.");
  }
  if (e.code === "Escape") {
    modeHistoire = false;
    retourMenu();
  }
});

// ----- Chapitre 3 : on conduit une voiture sur la route et on tire sur les zombies -----
const ZOMBIES_A_TUER = 15;
const route = { x: 0, volant: 0, distance: 0, zombies: [], vie: 20, tues: 0, tir: null, flash: 0, prochain: 60, fini: false, message: "", messageTemps: 0 };

function demarrerRoute() {
  chapitre = 3;
  dansMaison = false;
  route.x = 0;
  route.volant = 0;
  route.distance = 0;
  route.zombies = [];
  route.vie = 20;
  route.tues = 0;
  route.tir = null;
  route.flash = 0;
  route.prochain = 60;
  route.fini = false;
  route.message = "Chapitre 3 : la route ! Conduis avec ← → et tire avec Espace.";
  route.messageTemps = 240;
  sauverHistoire();
}

// Perspective : p vaut 1 tout près de nous et presque 0 à l'horizon
function projeter(x, z) {
  const L = canvas.width;
  const H = canvas.height;
  const horizon = H * 0.42;
  const p = 60 / (z + 60);
  return { p: p, sx: L / 2 + (x - route.x) * 300 * p, sy: horizon + (H * 0.8 - horizon) * p };
}

function miseAJourRoute() {
  if (route.fini) return;
  tempsForet++;
  // Le volant tourne doucement vers ce qu'on demande, la voiture suit le volant
  const cible = (touches["ArrowRight"] ? 1 : 0) - (touches["ArrowLeft"] ? 1 : 0);
  route.volant += (cible - route.volant) * 0.12;
  route.x = Math.max(-1, Math.min(1, route.x + route.volant * 0.025));
  route.distance += 5;
  route.prochain--;
  if (route.prochain <= 0) {
    route.prochain = 40 + Math.random() * 50;
    route.zombies.push({ x: (Math.random() * 1.6 - 0.8), z: 1100, pv: 2, phase: Math.random() * 6 });
  }
  route.zombies.forEach(function (zo) {
    zo.z -= 5 + 1.2; // la voiture avance et le zombie vient vers nous
    zo.x += Math.sign(route.x - zo.x) * 0.002;
  });
  route.zombies = route.zombies.filter(function (zo) {
    if (zo.pv <= 0) return false;
    if (zo.z > 20) return true;
    if (Math.abs(zo.x - route.x) < 0.16) { // il se jette sur la voiture
      route.vie -= 3;
      route.flash = 10;
    }
    return false;
  });
  if (route.flash > 0) route.flash--;
  if (route.messageTemps > 0) route.messageTemps--;
  if (route.tir) { route.tir.t--; if (route.tir.t <= 0) route.tir = null; }
  if (route.vie <= 0) { // la voiture est abîmée : on recommence la route
    demarrerRoute();
    route.message = "La voiture est abîmée ! On recommence la route.";
  }
  if (route.tues >= ZOMBIES_A_TUER) route.fini = true;
}

function tirerRoute() {
  if (route.fini) return;
  let cible = null;
  route.zombies.forEach(function (zo) { // le zombie le plus proche, aligné avec la voiture
    if (zo.pv > 0 && Math.abs(zo.x - route.x) < 0.2 && (!cible || zo.z < cible.z)) cible = zo;
  });
  const bouche = { sx: canvas.width / 2 + 100, sy: canvas.height - 150 };
  if (cible) {
    const pr = projeter(cible.x, cible.z);
    route.tir = { x: pr.sx, y: pr.sy - 60 * pr.p, bx: bouche.sx, by: bouche.sy, t: 6 };
    cible.pv -= ARMES[niveauArme].balles > 1 ? 2 : 1;
    if (cible.pv <= 0) route.tues++;
  } else {
    route.tir = { x: canvas.width / 2, y: canvas.height * 0.42, bx: bouche.sx, by: bouche.sy, t: 6 };
  }
}

// Les zombies de la route : combinaison orange, peau grise et yeux jaunes qui brillent
function dessinerZombieRoute(zo) {
  const pr = projeter(zo.x, zo.z);
  const s = pr.p * 150; // taille à l'écran
  const pas = Math.sin(tempsForet / 4 + zo.phase);
  const bob = Math.abs(pas) * 0.03 * s;
  const x = pr.sx;
  const pied = pr.sy;
  ctx.globalAlpha = Math.max(0.15, Math.min(1, 1.3 - zo.z / 1100));
  ctx.fillStyle = "#5a3a10"; // bottes
  ctx.fillRect(x - 0.17 * s, pied - 0.1 * s - Math.max(0, pas) * 0.08 * s, 0.14 * s, 0.1 * s);
  ctx.fillRect(x + 0.03 * s, pied - 0.1 * s - Math.max(0, -pas) * 0.08 * s, 0.14 * s, 0.1 * s);
  ctx.fillStyle = "#c86a10"; // jambes de la combinaison
  ctx.fillRect(x - 0.15 * s, pied - 0.4 * s - Math.max(0, pas) * 0.08 * s, 0.12 * s, 0.32 * s);
  ctx.fillRect(x + 0.03 * s, pied - 0.4 * s - Math.max(0, -pas) * 0.08 * s, 0.12 * s, 0.32 * s);
  ctx.fillStyle = "#e07a14"; // corps orange
  ctx.fillRect(x - 0.2 * s, pied - 0.8 * s - bob, 0.4 * s, 0.42 * s);
  ctx.fillStyle = "#ffd400"; // bande réfléchissante
  ctx.fillRect(x - 0.2 * s, pied - 0.62 * s - bob, 0.4 * s, 0.05 * s);
  ctx.fillStyle = "#c86a10"; // bras qui pendent et se balancent
  ctx.fillRect(x - 0.3 * s, pied - 0.78 * s - bob + pas * 0.06 * s, 0.1 * s, 0.38 * s);
  ctx.fillRect(x + 0.2 * s, pied - 0.78 * s - bob - pas * 0.06 * s, 0.1 * s, 0.38 * s);
  ctx.fillStyle = "#9aa0a8"; // tête grise un peu penchée
  ctx.beginPath();
  ctx.arc(x + pas * 0.02 * s, pied - 0.92 * s - bob, 0.14 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffe040"; // yeux jaunes brillants
  ctx.shadowColor = "#ffe040";
  ctx.shadowBlur = 8;
  ctx.fillRect(x - 0.08 * s + pas * 0.02 * s, pied - 0.95 * s - bob, 0.05 * s, 0.04 * s);
  ctx.fillRect(x + 0.03 * s + pas * 0.02 * s, pied - 0.95 * s - bob, 0.05 * s, 0.04 * s);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

function dessinerRoute() {
  const L = canvas.width;
  const H = canvas.height;
  const horizon = H * 0.42;
  const ciel = ctx.createLinearGradient(0, 0, 0, horizon);
  ciel.addColorStop(0, "#0a0614");
  ciel.addColorStop(1, "#5a2a3a");
  ctx.fillStyle = ciel;
  ctx.fillRect(0, 0, L, horizon);
  dessinerEtoiles(L, horizon, 0);
  ctx.fillStyle = "#14201a"; // champs sombres de chaque côté
  ctx.fillRect(0, horizon, L, H - horizon);
  // La route : plus étroite au loin
  const loin = projeter(0, 1100);
  const pres = projeter(0, -40);
  ctx.fillStyle = "#2a2a30";
  ctx.beginPath();
  ctx.moveTo(L / 2 - (1.1 + route.x) * 300 * loin.p + 0 - 0, loin.sy);
  ctx.lineTo(L / 2 + (1.1 - route.x) * 300 * loin.p, loin.sy);
  ctx.lineTo(L / 2 + (1.1 - route.x) * 300 * pres.p, pres.sy);
  ctx.lineTo(L / 2 - (1.1 + route.x) * 300 * pres.p, pres.sy);
  ctx.closePath();
  ctx.fill();
  // Traits blancs au milieu et arbres sur les côtés : ils défilent pour donner la vitesse
  const decalage = route.distance % 100;
  for (let z = 1100 - decalage; z > -40; z -= 100) {
    const a = projeter(0, z);
    const b = projeter(0, z + 40);
    ctx.fillStyle = "#e8e0c0";
    ctx.fillRect(a.sx - 5 * a.p, b.sy, 10 * a.p, a.sy - b.sy);
    [-1.7, 1.7].forEach(function (cote) {
      const t = projeter(cote, z);
      ctx.fillStyle = "#07120c";
      ctx.beginPath();
      ctx.moveTo(t.sx - 40 * t.p, t.sy);
      ctx.lineTo(t.sx, t.sy - 220 * t.p);
      ctx.lineTo(t.sx + 40 * t.p, t.sy);
      ctx.fill();
    });
  }
  // Les zombies, les plus loin d'abord
  route.zombies.slice().sort(function (a, b) { return b.z - a.z; }).forEach(dessinerZombieRoute);
  if (route.tir) { // trait lumineux du tir
    ctx.strokeStyle = "#ffe040";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(route.tir.bx, route.tir.by);
    ctx.lineTo(route.tir.x, route.tir.y);
    ctx.stroke();
  }
  // L'intérieur de la voiture : tableau de bord et volant qui tourne
  ctx.fillStyle = "#101014";
  ctx.fillRect(0, H - 170, L, 170);
  ctx.fillStyle = "#1c1c22";
  ctx.fillRect(0, H - 170, L, 14);
  ctx.fillStyle = "#101014"; // montants du pare-brise
  ctx.fillRect(0, 0, 18, H - 170);
  ctx.fillRect(L - 18, 0, 18, H - 170);
  ctx.save();
  ctx.translate(L / 2 - 60, H - 40);
  ctx.rotate(route.volant * 0.9); // le volant réagit à nos mouvements
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(0, 0, 80, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(-80, 0); ctx.lineTo(80, 0);
  ctx.moveTo(0, 0); ctx.lineTo(0, 80);
  ctx.stroke();
  ctx.fillStyle = "#d32f2f"; // repère rouge en haut du volant
  ctx.fillRect(-6, -90, 12, 20);
  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.arc(0, 0, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#555"; // l'arme sort par la fenêtre
  ctx.fillRect(L / 2 + 90, H - 150, 20, 90);
  ctx.fillStyle = "#222";
  ctx.fillRect(L / 2 + 94, H - 165, 12, 18);
  if (route.flash > 0) {
    ctx.fillStyle = "rgba(255, 0, 0, " + route.flash * 0.04 + ")";
    ctx.fillRect(0, 0, L, H);
  }
  ctx.fillStyle = "#fff";
  ctx.font = "16px Arial";
  ctx.textAlign = "center";
  ctx.fillText("Vie de la voiture : " + route.vie + " | Zombies : " + route.tues + "/" + ZOMBIES_A_TUER, L / 2, 24);
  ctx.font = "14px Arial";
  ctx.fillText("← → : conduire | Espace : tirer | Échap : menu", L / 2, H - 10);
  if (route.messageTemps > 0 && !route.fini) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(30, 44, L - 60, 34);
    ctx.fillStyle = "#ffd400";
    ctx.font = "16px Arial";
    ctx.fillText(route.message, L / 2, 66);
  }
  if (route.fini) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    ctx.fillRect(0, 0, L, H);
    ctx.fillStyle = "#ffd400";
    ctx.font = "30px Arial";
    ctx.fillText("Route libre !", L / 2, 250);
    ctx.fillStyle = "#fff";
    ctx.font = "18px Arial";
    ctx.fillText("Tu as vaincu tous les zombies de la route.", L / 2, 290);
    ctx.fillText("Tu arrives aux portes de la ville...", L / 2, 320);
    ctx.fillText("Entrée : chapitre 4 | Échap : menu", L / 2, 360);
  }
}

function boucle() {
  boutonPause.style.display = (!enAttente && !finDuJeu && !victoire) ? "block" : "none";
  document.getElementById("boutonPauseHistoire").style.display = modeHistoire ? "block" : "none";
  if (modeHistoire && chapitre === 3) {
    if (!pauseHistoire) miseAJourRoute();
    dessinerRoute();
  } else if (modeHistoire) {
    if (!pauseHistoire) miseAJourForet();
    dessinerForet();
  } else {
    miseAJour();
    dessiner();
  }
  requestAnimationFrame(boucle);
}

nouvelleVague();
boucle();
