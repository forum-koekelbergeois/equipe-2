const canvas = document.getElementById("jeu");
const ctx = canvas.getContext("2d");
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
let touches = {};
let temps = 0;

// ----- Sons fabriqués avec le navigateur (pas de fichier audio) -----
let audio = null;

function initAudio() {
  if (!audio) {
    try {
      audio = new AudioContext();
    } catch (e) {}
  }
  if (audio && audio.state === "suspended") audio.resume();
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
  gain.connect(audio.destination);
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
  boss:   { base: 65,  forme: "sawtooth", volume: 0.08 }
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
  if (finDuJeu) return;
  const arme = ARMES[niveauArme];
  recharge = arme.cadence;
  if (!joueurBulle.bulle && Math.random() < 0.12) {
    parler(joueurBulle, choisir(PHRASES_HEROS));
    zombieRepond();
  }
  const milieu = joueur.x + joueur.largeur / 2;
  for (let i = 0; i < arme.balles; i++) {
    const decalage = (i - (arme.balles - 1) / 2) * 12;
    balles.push({ x: milieu + decalage, y: SOL - 50 });
  }
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

function lancerBombe() {
  if (finDuJeu || !bombeDispo) return;
  bombeDispo = false;
  flashBlanc = 1;
  zombies.forEach(function (z) {
    z.touche = true;
    zombiesTues++;
    score += z.boss ? 10 : 1;
  });
  zombies = zombies.filter(function (z) { return !z.touche; });
  parler(joueurBulle, "Boum ! Plus personne !");
}

function nouvelleVague() {
  vague++;
  if (vague % 3 === 0) nouvelAllie();
  if (vague === 6) {
    bombeItem = { x: 80 + Math.random() * (canvas.width - 160), y: -30 };
    parler(joueurBulle, "Une bombe arrive du ciel !");
  }
  if (vague > 1) parler(joueurBulle, "Ils reviennent !");
  zombiesAApparaitre = 3 + vague * 2;
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
  const type = boss ? TYPES_BOSS[(vague / 2 - 1) % TYPES_BOSS.length] : "zombie";
  zombies.push({
    type: type,
    tenue: tenueAleatoire(boss),
    hauteurVoix: 0.8 + Math.random() * 0.4,
    x: 20 + Math.random() * (canvas.width - 70),
    y: boss ? -100 : -50,
    largeur: boss ? 60 : 30,
    hauteur: boss ? 100 : 50,
    echelle: boss ? 2 : 1,
    boss: boss,
    pv: boss ? 6 + vague * 3 : Math.ceil(vague * 0.7), // plus de vie à chaque vague
    pvMax: boss ? 6 + vague * 3 : Math.ceil(vague * 0.7),
    vitesse: boss ? 1 + vague * 0.05 : 1.8 + Math.random() * 0.8 + vague * 0.2, // plus rapide à chaque vague
    phase: Math.random() * 10,     // pour que chaque zombie ait son propre rythme
    balancement: 0.5 + Math.random() * 0.8
  });
  // Le boss se présente, les autres parlent parfois
  const nouveau = zombies[zombies.length - 1];
  if (boss) parler(nouveau, PHRASES_TYPE_BOSS[type]);
  else if (Math.random() < 0.25) parler(nouveau, choisir(PHRASES_ZOMBIES));
}

function miseAJour() {
  if (finDuJeu) return;
  temps++;

  if (touches["ArrowLeft"] && joueur.x > 0) joueur.x -= joueur.vitesse;
  if (touches["ArrowRight"] && joueur.x < canvas.width - joueur.largeur) joueur.x += joueur.vitesse;

  // Tir automatique en gardant espace appuyé (AK-47 et mitraillette)
  recharge--;
  if (touches["Space"] && ARMES[niveauArme].cadence > 0 && recharge <= 0) tirer();

  balles.forEach(function (b) { b.y -= 10; });
  balles = balles.filter(function (b) { return b.y > -10; });

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
      prochainZombie = 40 - Math.min(vague * 2, 20);
    }
  } else if (zombies.length === 0) {
    pause++;
    if (pause > 120) {
      pause = 0;
      nouvelleVague();
    }
  }

  // Les zombies avancent en se balançant
  zombies.forEach(function (z) {
    z.y += z.vitesse;
    // Il se dirige vers le héros
    const cible = joueur.x + joueur.largeur / 2 - z.largeur / 2;
    if (z.x < cible - 1) z.x += z.vitesse * 0.6;
    else if (z.x > cible + 1) z.x -= z.vitesse * 0.6;
    z.x += Math.sin((temps + z.phase * 10) / 15) * z.balancement * 0.5;
    z.x = Math.max(0, Math.min(canvas.width - z.largeur, z.x));
  });

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
  zombies.concat(allies, [joueurBulle]).forEach(function (o) {
    if (!o.bulle) return;
    if (o.bulle.delai > 0) o.bulle.delai--;
    else if (--o.bulle.reste <= 0) o.bulle = null;
  });

  // Une balle touche un zombie
  balles.forEach(function (b) {
    zombies.forEach(function (z) {
      if (!z.touche && b.x > z.x && b.x < z.x + z.largeur && b.y > z.y - 10 * z.echelle && b.y < z.y + z.hauteur) {
        b.y = -100;
        z.pv--;
        if (z.pv <= 0) {
          z.touche = true;
          zombiesTues++;
          score += z.boss ? 10 : 1;
        }
      }
    });
  });

  // Un zombie arrive en bas : le héros perd une vie
  zombies.forEach(function (z) {
    if (z.y + z.hauteur >= SOL) {
      z.touche = true;
      vies -= 10;
      flashRouge = 1;
      parler(joueurBulle, "Aïe !");
      zombieRepond();
      if (vies <= 0 && !finDuJeu) {
        finDuJeu = true;
        boutonRejouer.style.display = "inline-block";
        musiqueDefaite();
      }
    }
  });
  zombies = zombies.filter(function (z) { return !z.touche; });

  if (zombiesTues > record) {
    record = zombiesTues;
    try {
      localStorage.setItem("recordZombies", record);
    } catch (e) {}
  }

  infos.textContent ="Vague : " + vague + " | Score : " + score + " | Vie : " + Math.max(vies, 0) + " | Arme : " + ARMES[niveauArme].nom +
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
  citrouille: "Bouh ! Je suis la citrouille !",
  squelette: "Clac clac ! Squelette !",
  zombie: "Je suis le grand chef !"
};
const joueurBulle = { bulle: null };

function parler(qui, texte, delai) {
  qui.bulle = { texte: texte, reste: 110, delai: delai || 0 };
  const profil = qui === joueurBulle ? "heros" : qui.couleur ? "allie" : qui.boss ? "boss" : "zombie";
  voix(texte, profil, qui.hauteurVoix || 1, (delai || 0) / 60);
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

// Dessine un zombie ou un boss avec ses vêtements au hasard
function dessinerZombie(z) {
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

// Étoiles placées une seule fois au hasard
const etoiles = [];
for (let i = 0; i < 40; i++) {
  etoiles.push({ x: Math.random() * 500, y: Math.random() * 300, p: Math.random() * 10 });
}

function dessiner() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Le décor dépend de la vague
  const th = THEMES[(Math.max(vague, 1) - 1) % THEMES.length];

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

  // Balles
  balles.forEach(function (b) {
    ctx.fillStyle = "rgba(255, 200, 0, 0.3)"; // traînée lumineuse
    ctx.fillRect(b.x - 3, b.y, 6, 24);
    ctx.fillStyle = "#fff6a0";
    ctx.fillRect(b.x - 2, b.y, 4, 10);
  });

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
  dessinerPersonnage(joueur.x, SOL - 50, "#d32f2f", "#f5c9a0", marche);
  // Casque bleu mauve
  ctx.fillStyle = "#6a5acd";
  ctx.beginPath();
  ctx.arc(joueur.x + 15, SOL - 50, 12, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(joueur.x + 1, SOL - 52, 28, 4);
  ctx.fillStyle = "#8f84e8"; // reflet sur le casque
  ctx.fillRect(joueur.x + 8, SOL - 58, 6, 3);
  // Yeux et sourire
  ctx.fillStyle = "#000";
  ctx.fillRect(joueur.x + 9, SOL - 49, 3, 4);
  ctx.fillRect(joueur.x + 18, SOL - 49, 3, 4);
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(joueur.x + 15, SOL - 45, 4, 0.2, Math.PI - 0.2);
  ctx.stroke();
  // Bras rouges et mains qui tiennent l'arme
  ctx.fillStyle = "#d32f2f";
  ctx.fillRect(joueur.x - 5, SOL - 38, 7, 22);
  ctx.fillRect(joueur.x + 28, SOL - 38, 7, 22);
  ctx.fillStyle = "#f5c9a0";
  ctx.fillRect(joueur.x + 12, SOL - 40, 6, 6);
  // Arme : chaque niveau a son propre dessin
  dessinerArme(joueur.x + 15, SOL - 38, niveauArme);

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
  joueurBulle.bulle = null;
  touches = {};
  finDuJeu = false;
  boutonRejouer.style.display = "none";
  boutonRejouer.blur();
  nouvelleVague();
}

boutonRejouer.addEventListener("click", rejouer);

function boucle() {
  miseAJour();
  dessiner();
  requestAnimationFrame(boucle);
}

nouvelleVague();
boucle();
