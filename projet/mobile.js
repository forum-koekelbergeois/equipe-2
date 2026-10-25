// Version mobile : réduit le jeu pour qu'il tienne dans l'écran et ajoute des boutons tactiles
// qui envoient au jeu les mêmes touches que le clavier. Ne fait rien sur ordinateur.
(function () {
  if (!window.matchMedia("(pointer: coarse)").matches) return;

  const racine = document.documentElement;
  racine.classList.add("tactile");
  if (!racine.requestFullscreen) racine.classList.add("sansPleinEcran");

  const zone = document.getElementById("zone");
  const infos = document.getElementById("infos");
  const LARGEUR = zone.offsetWidth;
  const HAUTEUR = zone.offsetHeight;

  const TOUCHES = {
    gauche: { code: "ArrowLeft", key: "ArrowLeft", texte: "←" },
    droite: { code: "ArrowRight", key: "ArrowRight", texte: "→" },
    haut: { code: "ArrowUp", key: "ArrowUp", texte: "↑" },
    bas: { code: "ArrowDown", key: "ArrowDown", texte: "↓" },
    tirer: { code: "Space", key: " ", texte: "Tirer" },
    bombe: { code: "KeyB", key: "b", texte: "Bombe" },
    entree: { code: "Enter", key: "Enter", texte: "Entrée" },
    echap: { code: "Escape", key: "Escape", texte: "Échap" },
    arme1: { code: "Digit1", key: "1", texte: "1" },
    arme2: { code: "Digit2", key: "2", texte: "2" },
    arme3: { code: "Digit3", key: "3", texte: "3" },
    arme4: { code: "Digit4", key: "4", texte: "4" }
  };

  // [nom de la touche, classes en plus] ; siHistoire / siNormal : seulement dans ce mode
  const DISPOSITION = {
    gauche: [
      [["haut", "siHistoire"]],
      [["gauche"], ["bas", "siHistoire"], ["droite"]]
    ],
    droite: [
      [["arme1", "petite siHistoire"], ["arme2", "petite siHistoire"], ["arme3", "petite siHistoire"], ["arme4", "petite siHistoire"]],
      [["entree", "moyenne siHistoire"], ["echap", "moyenne siHistoire"]],
      [["bombe", "siNormal"], ["tirer", "large"]]
    ]
  };

  const boutons = {};
  const commandes = document.createElement("div");
  commandes.id = "commandesTactiles";
  Object.keys(DISPOSITION).forEach(function (cote) {
    const bloc = document.createElement("div");
    bloc.className = "blocTactile " + cote;
    DISPOSITION[cote].forEach(function (rangee) {
      const ligne = document.createElement("div");
      ligne.className = "ligneTactile";
      rangee.forEach(function (r) {
        const el = document.createElement("button");
        el.type = "button";
        el.tabIndex = -1;
        el.className = "toucheTactile " + (r[1] || "");
        el.textContent = TOUCHES[r[0]].texte;
        boutons[r[0]] = { el: el, touche: TOUCHES[r[0]], doigts: new Set() };
        ligne.appendChild(el);
      });
      bloc.appendChild(ligne);
    });
    commandes.appendChild(bloc);
  });
  document.body.appendChild(commandes);
  const blocs = commandes.querySelectorAll(".blocTactile");

  // ----- Appuis : chaque doigt est suivi séparément -----
  // Les touches créées par un script ne passent pas par le changement de touches du jeu :
  // on envoie donc toujours la touche d'origine, sur document, là où le jeu écoute.
  const appuis = new Map(); // numéro du doigt -> bouton

  function envoyer(type, touche) {
    document.dispatchEvent(new KeyboardEvent(type, { code: touche.code, key: touche.key, bubbles: true, cancelable: true }));
  }

  function lacher(doigt) {
    const b = appuis.get(doigt);
    if (!b) return;
    appuis.delete(doigt);
    b.doigts.delete(doigt);
    if (b.doigts.size === 0) {
      b.el.classList.remove("appuye");
      envoyer("keyup", b.touche);
    }
  }

  function toutLacher() {
    Array.from(appuis.keys()).forEach(lacher);
  }

  Object.keys(boutons).forEach(function (nom) {
    const b = boutons[nom];
    b.el.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      // Sans ça, le doigt reste "attaché" au bouton et on ne saurait pas qu'il en est sorti
      if (b.el.hasPointerCapture(e.pointerId)) b.el.releasePointerCapture(e.pointerId);
      if (appuis.has(e.pointerId)) return;
      appuis.set(e.pointerId, b);
      b.doigts.add(e.pointerId);
      if (b.doigts.size === 1) {
        b.el.classList.add("appuye");
        envoyer("keydown", b.touche);
      }
    });
    b.el.addEventListener("pointerleave", function (e) { lacher(e.pointerId); });
    b.el.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  });

  document.addEventListener("pointermove", function (e) {
    const b = appuis.get(e.pointerId);
    if (!b) return;
    const dessous = document.elementFromPoint(e.clientX, e.clientY);
    if (!dessous || !b.el.contains(dessous)) lacher(e.pointerId);
  }, true);
  document.addEventListener("pointerup", function (e) { lacher(e.pointerId); }, true);
  document.addEventListener("pointercancel", function (e) { lacher(e.pointerId); }, true);
  window.addEventListener("blur", toutLacher);
  window.addEventListener("pagehide", toutLacher);
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) toutLacher();
  });

  // ----- Mise en page : le jeu est réduit pour laisser la place aux commandes -----
  let derniereLargeur = 0;
  let derniereHauteur = 0;
  let caleSurJeu = false;

  // innerWidth grandit si la page dépasse : on prend la vraie taille de l'écran
  function largeurEcran() { return document.documentElement.clientWidth; }
  function hauteurEcran() { return document.documentElement.clientHeight; }

  // La ligne d'infos change pendant la partie : on garde la place de la plus longue possible,
  // mesurée sur une copie invisible, pour que le jeu ne change pas de taille en pleine partie
  const INFOS_LONGUES = "HARDCORE | Level 99 | Vague : 99 | Score : 99999 | Vie : 30 | Pièces : 99999 | Niveau héros : 99 (exp 999/990, force 99.99) | Trophées : 999 | Arme : Double pistolet | BOMBE PRÊTE : touche B";

  function hauteurInfos() {
    const s = getComputedStyle(infos);
    if (s.display === "none") return 0;
    const copie = infos.cloneNode(false);
    copie.removeAttribute("id");
    copie.style.visibility = "hidden";
    copie.textContent = INFOS_LONGUES;
    infos.after(copie);
    const h = Math.max(copie.offsetHeight, infos.offsetHeight);
    copie.remove();
    return h + parseFloat(s.marginTop) + parseFloat(s.marginBottom);
  }

  function disposer() {
    derniereLargeur = largeurEcran();
    derniereHauteur = hauteurEcran();
    const paysage = largeurEcran() > hauteurEcran();
    racine.classList.toggle("paysage", paysage);

    let reserveBas = 0;
    let reserveCote = 0;
    blocs.forEach(function (bloc) {
      reserveBas = Math.max(reserveBas, bloc.offsetHeight + 14);
      reserveCote = Math.max(reserveCote, bloc.offsetWidth + 14);
    });
    if (paysage) reserveBas = 0;
    else reserveCote = 0;

    zone.style.transform = "";
    zone.style.margin = "";
    document.body.style.paddingBottom = reserveBas + "px";
    document.body.style.minHeight = "";
    infos.style.marginLeft = reserveCote ? reserveCote + "px" : "";
    infos.style.marginRight = reserveCote ? reserveCote + "px" : "";

    const haut = zone.getBoundingClientRect().top + window.scrollY;
    const largeurDispo = largeurEcran() - 2 * Math.max(reserveCote, 8);
    const hauteurDispo = hauteurEcran() - reserveBas - hauteurInfos() - 4;
    const avecTitre = Math.min(1, largeurDispo / LARGEUR, (hauteurDispo - haut) / HAUTEUR);
    const sansTitre = Math.min(1, largeurDispo / LARGEUR, hauteurDispo / HAUTEUR);
    // Si le titre prend trop de place, la page se cale sur le jeu (le titre reste au-dessus)
    caleSurJeu = avecTitre < 0.85 * sansTitre;
    const echelle = caleSurJeu ? sansTitre : avecTitre;

    if (echelle < 1) {
      zone.style.transformOrigin = "top center";
      zone.style.transform = "scale(" + echelle + ")";
      const marge = (1 - echelle) * LARGEUR / 2;
      zone.style.margin = "0 " + (-marge) + "px " + (-(1 - echelle) * HAUTEUR) + "px";
    }
    if (caleSurJeu) {
      document.body.style.minHeight = (haut + hauteurEcran()) + "px";
      caler();
    }
  }

  function caler() {
    if (caleSurJeu) window.scrollTo(0, zone.getBoundingClientRect().top + window.scrollY);
  }

  window.addEventListener("resize", function () {
    // La barre du navigateur qui disparaît agrandit un peu l'écran : on l'ignore pour que le jeu
    // ne change pas de taille sans arrêt ; mais si l'écran rétrécit, on refait tout pour ne rien cacher
    const h = hauteurEcran();
    if (largeurEcran() !== derniereLargeur || h < derniereHauteur || h - derniereHauteur > 150) disposer();
  });
  window.addEventListener("orientationchange", function () { setTimeout(disposer, 300); });
  document.addEventListener("fullscreenchange", function () { setTimeout(disposer, 100); });

  // ----- Les commandes suivent l'état du jeu (lu seulement, jamais modifié) -----
  let etatPrecedent = "";

  function suivreJeu() {
    const histoire = modeHistoire;
    const enJeu = histoire ? !pauseHistoire : (!enAttente && !finDuJeu && !victoire && !enPause);
    const etat = (enJeu ? "jeu" : "menu") + (histoire ? "-histoire" : "");
    if (etat !== etatPrecedent) {
      const changeMode = etatPrecedent.indexOf("histoire") >= 0 !== histoire;
      etatPrecedent = etat;
      toutLacher();
      racine.classList.toggle("enJeu", enJeu);
      racine.classList.toggle("histoire", histoire);
      if (changeMode) disposer();
      else if (enJeu) caler();
    }
    if (histoire) {
      [1, 2, 3, 4].forEach(function (n) {
        const el = boutons["arme" + n].el;
        el.classList.toggle("absent", armesPossedees.indexOf(n - 1) < 0);
        el.classList.toggle("actif", niveauArme === n - 1);
      });
    } else {
      boutons.bombe.el.classList.toggle("absent", !bombeDispo);
    }
    requestAnimationFrame(suivreJeu);
  }

  disposer();
  suivreJeu();
})();
