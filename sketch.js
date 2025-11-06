// Configuration
const canvas = document.getElementById('canvas');
const displayCanvas = document.getElementById('displayCanvas');
// Utiliser WebGL 1 pour compatibilité avec les shaders Shadertoy
const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
const displayCtx = displayCanvas.getContext('2d');
const status = document.getElementById('status');
const exportButton = document.getElementById('exportButton');

if (!gl) {
    console.error('WebGL non disponible');
}

// Variables globales
let shaderPrograms = {};
let buffers = {};
let isPaused = false;
let pauseStartTime = 0;

// Paramètres du shader (contrôlables via l'UI)
let shaderParams = {
    scale: 6.0,
    phaseX: 0.1,        // Phase dans la direction X
    velocity: 0.2,      // Vitesse d'animation (renommé de velocityY)
    mode1Detail: 200.0,
    mode1Twist: 0.0,
    mode2Speed: 2.5,
    brightness: 1.0,
    hue: 33.0,          // Rotation de la teinte (0-360 degrés)
    saturation: 1.0,     // Saturation (0-2)
    vibrance: 0.0,      // Vibrance (-1 à 1)
    contrast: 1.0,      // Contraste (0-2)
    rgbMultiplierR: 1.0, // Multiplicateur canal Rouge
    rgbMultiplierG: 1.0, // Multiplicateur canal Vert
    rgbMultiplierB: 1.0, // Multiplicateur canal Bleu
    colorOffset: 0.0,   // Offset de couleur (-1 à 1)
    grainAmount: 0.0,   // Quantité de grain (0-1, mix)
    grainSize: 2.0,     // Taille du grain (0.1-10)
    posterize: 256.0,    // Niveaux de quantification (2-256)
    scanlines: 0.0,      // Intensité des scanlines (0-1)
    scanlineWidth: 1.0,  // Largeur/espacement des scanlines (0.1-5.0)
    movementMode: 0,    // Mode de mouvement (0=par défaut, 1=linéaire, 2=tourbillon, 3=résonance, 4=perturbation, 5=éclatement, 6=écoulement, 7=statique)
    gradientColors: [], // Couleurs du dégradé personnalisé (array de vec3 RGB)
    exportResolution: 4096
};

// Initialisation
function init() {
    if (!gl) {
        alert('WebGL n\'est pas supporté sur votre navigateur');
        return;
    }

    // Ajuster la taille du canvas
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Charger les shaders et démarrer le rendu une fois chargé
    loadShaders().then(() => {
        // Initialiser les sliders
        initSliders();
        
        // Initialiser les champs de couleur gradient
        initGradientColors();
        
        // Bouton d'export
        exportButton.addEventListener('click', exportHighQuality);
        
        // Bouton pause/play
        const playPauseButton = document.getElementById('playPauseButton');
        if (playPauseButton) {
            playPauseButton.addEventListener('click', () => {
                isPaused = !isPaused;
                if (isPaused) {
                    pauseStartTime = Date.now();
                    playPauseButton.textContent = '▶ play';
                    playPauseButton.classList.add('paused');
                } else {
                    // Ajuster startTime pour compenser le temps de pause
                    const pauseDuration = Date.now() - pauseStartTime;
                    startTime += pauseDuration;
                    playPauseButton.textContent = '⏸ pause';
                    playPauseButton.classList.remove('paused');
                }
            });
        }
        
        // Bouton de reset
        const resetButton = document.getElementById('resetButton');
        if (resetButton) {
            resetButton.addEventListener('click', resetAllParameters);
        }

        // Bouton de randomize
        const randomizeButton = document.getElementById("randomizeButton");
        if (randomizeButton) {
          randomizeButton.addEventListener("click", randomizeAllParameters);
        }
          
        // Démarrer le rendu une fois le shader chargé
        startRender();
    }).catch(error => {
        console.error('Erreur lors de l\'initialisation:', error);
        status.textContent = 'Erreur: ' + error.message;
    });
}

// Convertir HEX en RGB (0-1)
function hexToRgb(hex) {
    if (!hex || hex.length < 7) return null;
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
        parseInt(result[1], 16) / 255.0,
        parseInt(result[2], 16) / 255.0,
        parseInt(result[3], 16) / 255.0
    ] : null;
}

// Initialiser les champs de couleur gradient
function initGradientColors() {
    const container = document.getElementById('gradientColorsContainer');
    if (!container) return;
    
    // Variable partagée pour le drag & drop
    let draggedElement = null;
    
    // Créer le premier champ
    addGradientColorInput(container);
    
    // Fonction pour ajouter un nouveau champ
    function addGradientColorInput(parent) {
        const group = document.createElement('div');
        group.className = 'color-input-group';
        group.draggable = true;
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'hex-color-input';
        input.placeholder = '#000000';
        input.maxLength = 7;
        input.pattern = '#[0-9A-Fa-f]{6}';
        
        // Empêcher le drag sur l'input pour éviter les conflits
        input.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });
        
        const preview = document.createElement('div');
        preview.className = 'color-preview';
        
        // Sélecteur de couleur caché
        const colorPicker = document.createElement('input');
        colorPicker.type = 'color';
        colorPicker.style.position = 'absolute';
        colorPicker.style.opacity = '0';
        colorPicker.style.width = '0';
        colorPicker.style.height = '0';
        colorPicker.style.pointerEvents = 'none';
        
        // Ouvrir le sélecteur de couleur au double-clic sur le preview
        preview.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Si le champ a déjà une couleur, l'utiliser comme valeur initiale
            const currentHex = input.value;
            if (currentHex && /^#[0-9A-Fa-f]{6}$/.test(currentHex)) {
                colorPicker.value = currentHex;
            } else {
                colorPicker.value = '#000000';
            }
            
            // Ouvrir le sélecteur de couleur
            colorPicker.click();
        });
        
        // Mettre à jour le champ de texte quand la couleur change
        colorPicker.addEventListener('input', (e) => {
            const hex = e.target.value.toUpperCase();
            input.value = hex;
            
            // Déclencher l'event input pour mettre à jour le preview et le gradient
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        
        // Ajouter le color picker au DOM (dans le body pour éviter les problèmes de z-index)
        if (!document.getElementById('hiddenColorPickers')) {
            const hiddenContainer = document.createElement('div');
            hiddenContainer.id = 'hiddenColorPickers';
            hiddenContainer.style.position = 'absolute';
            hiddenContainer.style.top = '-9999px';
            hiddenContainer.style.left = '-9999px';
            document.body.appendChild(hiddenContainer);
        }
        document.getElementById('hiddenColorPickers').appendChild(colorPicker);
        
        // Drag & Drop handlers
        group.addEventListener('dragstart', (e) => {
            draggedElement = group;
            group.style.opacity = '0.5';
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', group.innerHTML);
        });
        
        group.addEventListener('dragend', (e) => {
            group.style.opacity = '';
            draggedElement = null;
            // Retirer les classes de drag over de tous les éléments
            container.querySelectorAll('.color-input-group').forEach(g => {
                g.classList.remove('drag-over');
            });
        });
        
        group.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            
            if (draggedElement && draggedElement !== group) {
                const allGroups = Array.from(container.querySelectorAll('.color-input-group'));
                const draggedIndex = allGroups.indexOf(draggedElement);
                const currentIndex = allGroups.indexOf(group);
                
                // Retirer la classe de tous les éléments
                allGroups.forEach(g => g.classList.remove('drag-over'));
                
                // Ajouter la classe seulement si on est au-dessus d'un élément différent
                if (draggedIndex !== currentIndex) {
                    group.classList.add('drag-over');
                }
            }
        });
        
        group.addEventListener('dragleave', (e) => {
            // Ne retirer la classe que si on quitte vraiment l'élément
            if (!group.contains(e.relatedTarget)) {
                group.classList.remove('drag-over');
            }
        });
        
        group.addEventListener('drop', (e) => {
            e.preventDefault();
            group.classList.remove('drag-over');
            
            if (draggedElement && draggedElement !== group) {
                const allGroups = Array.from(container.querySelectorAll('.color-input-group'));
                const draggedIndex = allGroups.indexOf(draggedElement);
                const currentIndex = allGroups.indexOf(group);
                
                if (draggedIndex !== currentIndex) {
                    // Réorganiser les éléments
                    if (draggedIndex < currentIndex) {
                        container.insertBefore(draggedElement, group.nextSibling);
                    } else {
                        container.insertBefore(draggedElement, group);
                    }
                    
                    updateGradientColors();
                }
            }
            draggedElement = null;
        });
        
        // Mettre à jour le preview quand la couleur change
        input.addEventListener('input', (e) => {
            const hex = e.target.value;
            if (hex.length === 7 && /^#[0-9A-Fa-f]{6}$/.test(hex)) {
                preview.style.backgroundColor = hex;
                preview.classList.add('has-color');
                
                // Ajouter un nouveau champ si c'est le dernier et qu'il est rempli
                const allGroups = container.querySelectorAll('.color-input-group');
                if (group === allGroups[allGroups.length - 1]) {
                    addGradientColorInput(container);
                }
                
                updateGradientColors();
            } else {
                preview.style.backgroundColor = '';
                preview.classList.remove('has-color');
                updateGradientColors();
            }
        });
        
        // Permettre de supprimer si vide et qu'il y a plus d'un champ
        input.addEventListener('blur', () => {
            const allGroups = container.querySelectorAll('.color-input-group');
            if (allGroups.length > 1 && !input.value) {
                const inputs = container.querySelectorAll('.hex-color-input');
                const hasValue = Array.from(inputs).some(inp => inp.value && inp !== input);
                if (hasValue) {
                    group.remove();
                    updateGradientColors();
                }
            }
        });
        
        // Bouton de suppression
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'color-delete-btn';
        deleteBtn.innerHTML = '×';
        deleteBtn.type = 'button';
        deleteBtn.title = 'Supprimer cette couleur';
        deleteBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const allGroups = container.querySelectorAll('.color-input-group');
            // Ne pas supprimer s'il n'y a qu'un seul champ
            if (allGroups.length > 1) {
                group.remove();
                updateGradientColors();
            }
        });
        
        group.appendChild(input);
        group.appendChild(preview);
        group.appendChild(deleteBtn);
        parent.appendChild(group);
    }
    
    // Fonction pour mettre à jour les couleurs du gradient
    function updateGradientColors() {
        const inputs = container.querySelectorAll('.hex-color-input');
        const colors = [];
        
        inputs.forEach(input => {
            const hex = input.value.trim();
            if (hex.length === 7 && /^#[0-9A-Fa-f]{6}$/.test(hex)) {
                const rgb = hexToRgb(hex);
                if (rgb) {
                    colors.push(rgb);
                    console.log('Couleur ajoutée:', hex, '-> RGB:', rgb);
                }
            }
        });
        
        console.log('Nombre total de couleurs valides:', colors.length);
        shaderParams.gradientColors = colors;
        updateShaderParams();
        
        // Pas besoin de mettre à jour quoi que ce soit - la color ramp sera appliquée au prochain rendu
    }
}

// Initialiser les sliders
function initSliders() {
    // Menu déroulant pour le mode de mouvement
    const movementModeSelect = document.getElementById('movementMode');
    if (movementModeSelect) {
        movementModeSelect.value = shaderParams.movementMode.toString();
        movementModeSelect.addEventListener('change', (e) => {
            shaderParams.movementMode = parseInt(e.target.value);
            updateShaderParams();
            // Recharger les shaders pour appliquer le nouveau mode
            loadShaders().then(() => {
                console.log('Shader rechargé avec le mode de mouvement:', shaderParams.movementMode);
            }).catch(error => {
                console.error('Erreur lors du rechargement du shader:', error);
            });
        });
    }
    
    const sliders = {
        'scale': (value) => {
            shaderParams.scale = parseFloat(value);
            updateShaderParams();
        },
        'phaseX': (value) => {
            shaderParams.phaseX = parseFloat(value);
            updateShaderParams();
        },
        'velocityY': (value) => {
            shaderParams.velocity = parseFloat(value);
            updateShaderParams();
        },
        'mode1Detail': (value) => {
            shaderParams.mode1Detail = parseFloat(value);
            updateShaderParams();
        },
        'mode1Twist': (value) => {
            shaderParams.mode1Twist = parseFloat(value);
            updateShaderParams();
        },
        'mode2Speed': (value) => {
            shaderParams.mode2Speed = parseFloat(value);
            updateShaderParams();
        },
        'hue': (value) => {
            shaderParams.hue = parseFloat(value);
            updateShaderParams();
        },
        'saturation': (value) => {
            shaderParams.saturation = value / 100;
            updateShaderParams();
        },
        'vibrance': (value) => {
            shaderParams.vibrance = value / 100;
            updateShaderParams();
        },
        'brightness': (value) => {
            shaderParams.brightness = value / 100;
            updateShaderParams();
        },
        'contrast': (value) => {
            shaderParams.contrast = value / 100;
            updateShaderParams();
        },
        'rgbMultiplierR': (value) => {
            shaderParams.rgbMultiplierR = value / 100;
            updateShaderParams();
        },
        'rgbMultiplierG': (value) => {
            shaderParams.rgbMultiplierG = value / 100;
            updateShaderParams();
        },
        'rgbMultiplierB': (value) => {
            shaderParams.rgbMultiplierB = value / 100;
            updateShaderParams();
        },
        'colorOffset': (value) => {
            shaderParams.colorOffset = value / 100;
            updateShaderParams();
        },
        'grainAmount': (value) => {
            shaderParams.grainAmount = value / 100; // 0-200 slider -> 0-2.0 value
            updateShaderParams();
        },
        'grainSize': (value) => {
            shaderParams.grainSize = value / 10; // 0-100 slider -> 0-10 value
            updateShaderParams();
        },
        'posterize': (value) => {
            shaderParams.posterize = parseFloat(value);
            updateShaderParams();
        },
        'scanlines': (value) => {
            shaderParams.scanlines = value / 100; // 0-100 slider -> 0-1 value
            updateShaderParams();
        },
        'scanlineWidth': (value) => {
            shaderParams.scanlineWidth = value / 10; // 1-100 slider -> 0.1-10 value
            updateShaderParams();
        },
        'exportResolution': (value) => {
            shaderParams.exportResolution = parseInt(value);
            const valueDisplay = document.getElementById('exportResolutionValue');
            if (valueDisplay) {
                valueDisplay.textContent = value + 'px';
            }
        }
    };
    
    Object.keys(sliders).forEach(id => {
        const slider = document.getElementById(id);
        const valueDisplay = document.getElementById(id + 'Value');
        
        if (slider && valueDisplay) {
            slider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                // Afficher la valeur selon le type
                if (id === 'exportResolution') {
                    valueDisplay.textContent = Math.round(value) + 'px';
                } else if (id === 'scale' || id === 'phaseX' || id === 'velocityY' || 
                          id === 'mode1Detail' || id === 'mode1Twist' || id === 'mode2Speed') {
                    valueDisplay.textContent = value.toFixed(2);
                } else if (id === 'hue') {
                    valueDisplay.textContent = Math.round(value) + '°';
                } else if (id === 'saturation' || id === 'brightness' || id === 'vibrance' || 
                          id === 'contrast' || id === 'rgbMultiplierR' || id === 'rgbMultiplierG' || id === 'rgbMultiplierB') {
                    valueDisplay.textContent = Math.round(value) + '%';
                } else if (id === 'colorOffset') {
                    valueDisplay.textContent = value.toFixed(1);
                } else if (id === 'grainSize') {
                    valueDisplay.textContent = (value / 10).toFixed(1);
                } else if (id === 'grainAmount') {
                    // grainAmount peut aller jusqu'à 200% (slider 0-200)
                    valueDisplay.textContent = Math.round(value) + '%';
                } else if (id === 'posterize') {
                    valueDisplay.textContent = Math.round(value);
                } else if (id === 'scanlines') {
                    valueDisplay.textContent = Math.round(value) + '%';
                } else if (id === 'scanlineWidth') {
                    valueDisplay.textContent = (value / 10).toFixed(1);
                } else {
                    valueDisplay.textContent = Math.round(value) + '%';
                }
                sliders[id](value);
            });
        }
    });
}

// Mettre à jour les paramètres du shader
function updateShaderParams() {
    // Les paramètres sont passés via les uniforms dans renderPass
    // Le shader sera mis à jour en temps réel
}

// Valeurs par défaut des paramètres
const defaultParams = {
    scale: 6.0,
    phaseX: 0.1,
    velocity: 0.2,
    mode1Detail: 200.0,
    mode1Twist: 0.0,
    mode2Speed: 2.5,
    brightness: 1.0,
    hue: 33.0,
    saturation: 1.0,
    vibrance: 0.0,
    contrast: 1.0,
    rgbMultiplierR: 1.0,
    rgbMultiplierG: 1.0,
    rgbMultiplierB: 1.0,
    colorOffset: 0.0,
    grainAmount: 0.0,
    grainSize: 2.0,
    posterize: 256.0,
    scanlines: 0.0,
    scanlineWidth: 1.0,
    movementMode: 0,
    gradientColors: [],
    exportResolution: 4096
};

// Randomiser tous les paramètres
function randomizeAllParameters() {
  // Générer des valeurs aléatoires pour chaque paramètre (sauf COLOR et EFFECTS sections)
  shaderParams.scale = Math.random() * 21; // 0-20
  shaderParams.phaseX = Math.random() * 2; // 0-2
  shaderParams.velocity = Math.random() * 5; // 0-5
  shaderParams.mode1Detail = Math.floor(Math.random() * 991 + 10); // 10-1000
  shaderParams.mode1Twist = Math.floor(Math.random() * 101); // 0-100
  shaderParams.mode2Speed = Math.random() * 10; // 0-10
  shaderParams.movementMode = Math.floor(Math.random() * 8); // 0-7

  // Mettre à jour tous les sliders
  const scaleSlider = document.getElementById("scale");
  if (scaleSlider) {
    scaleSlider.value = shaderParams.scale;
    document.getElementById("scaleValue").textContent = shaderParams.scale.toFixed(2);
  }

  const phaseXSlider = document.getElementById("phaseX");
  if (phaseXSlider) {
    phaseXSlider.value = shaderParams.phaseX;
    document.getElementById("phaseXValue").textContent = shaderParams.phaseX.toFixed(2);
  }

  const velocityYSlider = document.getElementById("velocityY");
  if (velocityYSlider) {
    velocityYSlider.value = shaderParams.velocity;
    document.getElementById("velocityYValue").textContent = shaderParams.velocity.toFixed(2);
  }

  const mode1DetailSlider = document.getElementById("mode1Detail");
  if (mode1DetailSlider) {
    mode1DetailSlider.value = shaderParams.mode1Detail;
    document.getElementById("mode1DetailValue").textContent = shaderParams.mode1Detail.toFixed(2);
  }

  const mode1TwistSlider = document.getElementById("mode1Twist");
  if (mode1TwistSlider) {
    mode1TwistSlider.value = shaderParams.mode1Twist;
    document.getElementById("mode1TwistValue").textContent = shaderParams.mode1Twist.toFixed(2);
  }

  const mode2SpeedSlider = document.getElementById("mode2Speed");
  if (mode2SpeedSlider) {
    mode2SpeedSlider.value = shaderParams.mode2Speed;
    document.getElementById("mode2SpeedValue").textContent = shaderParams.mode2Speed.toFixed(2);
  }

  const movementModeSelect = document.getElementById("movementMode");
  if (movementModeSelect) {
    movementModeSelect.value = shaderParams.movementMode.toString();
  }

  // Randomiser les couleurs du gradient (2-6 couleurs)
  const gradientContainer = document.getElementById("gradientColorsContainer");
  if (gradientContainer) {
    const numColors = Math.floor(Math.random() * 5) + 2; // 2-6 colors
    const colors = [];

    // Supprimer tous les champs existants
    gradientContainer.innerHTML = "";

    // Variable partagée pour le drag & drop
    let draggedElement = null;

    // Fonction helper pour mettre à jour les couleurs
    const updateGradientColors = () => {
      const inputs = gradientContainer.querySelectorAll(".hex-color-input");
      const newColors = [];

      inputs.forEach((input) => {
        const hex = input.value.trim();
        if (hex.length === 7 && /^#[0-9A-Fa-f]{6}$/.test(hex)) {
          const rgb = hexToRgb(hex);
          if (rgb) {
            newColors.push(rgb);
          }
        }
      });

      shaderParams.gradientColors = newColors;
      updateShaderParams();
    };

    // Fonction helper pour ajouter un nouveau champ
    const addGradientColorInput = () => {
      const group = document.createElement("div");
      group.className = "color-input-group";
      group.draggable = true;

      const input = document.createElement("input");
      input.type = "text";
      input.className = "hex-color-input";
      input.placeholder = "#000000";
      input.maxLength = 7;
      input.pattern = "#[0-9A-Fa-f]{6}";

      input.addEventListener("mousedown", (e) => {
        e.stopPropagation();
      });

      const preview = document.createElement("div");
      preview.className = "color-preview";

      const colorPicker = document.createElement("input");
      colorPicker.type = "color";
      colorPicker.style.position = "absolute";
      colorPicker.style.opacity = "0";
      colorPicker.style.width = "0";
      colorPicker.style.height = "0";
      colorPicker.style.pointerEvents = "none";

      preview.addEventListener("dblclick", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const currentHex = input.value;
        if (currentHex && /^#[0-9A-Fa-f]{6}$/.test(currentHex)) {
          colorPicker.value = currentHex;
        } else {
          colorPicker.value = "#000000";
        }
        colorPicker.click();
      });

      colorPicker.addEventListener("input", (e) => {
        const hex = e.target.value.toUpperCase();
        input.value = hex;
        input.dispatchEvent(new Event("input", {bubbles: true}));
      });

      if (!document.getElementById("hiddenColorPickers")) {
        const hiddenContainer = document.createElement("div");
        hiddenContainer.id = "hiddenColorPickers";
        hiddenContainer.style.position = "absolute";
        hiddenContainer.style.top = "-9999px";
        hiddenContainer.style.left = "-9999px";
        document.body.appendChild(hiddenContainer);
      }
      document.getElementById("hiddenColorPickers").appendChild(colorPicker);

      // Drag & Drop handlers
      group.addEventListener("dragstart", (e) => {
        draggedElement = group;
        group.style.opacity = "0.5";
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/html", group.innerHTML);
      });

      group.addEventListener("dragend", (e) => {
        group.style.opacity = "";
        draggedElement = null;
        gradientContainer.querySelectorAll(".color-input-group").forEach((g) => {
          g.classList.remove("drag-over");
        });
      });

      group.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";

        if (draggedElement && draggedElement !== group) {
          const allGroups = Array.from(gradientContainer.querySelectorAll(".color-input-group"));
          const draggedIndex = allGroups.indexOf(draggedElement);
          const currentIndex = allGroups.indexOf(group);

          allGroups.forEach((g) => g.classList.remove("drag-over"));

          if (draggedIndex !== currentIndex) {
            group.classList.add("drag-over");
          }
        }
      });

      group.addEventListener("dragleave", (e) => {
        if (!group.contains(e.relatedTarget)) {
          group.classList.remove("drag-over");
        }
      });

      group.addEventListener("drop", (e) => {
        e.preventDefault();
        group.classList.remove("drag-over");

        if (draggedElement && draggedElement !== group) {
          const allGroups = Array.from(gradientContainer.querySelectorAll(".color-input-group"));
          const draggedIndex = allGroups.indexOf(draggedElement);
          const currentIndex = allGroups.indexOf(group);

          if (draggedIndex !== currentIndex) {
            if (draggedIndex < currentIndex) {
              gradientContainer.insertBefore(draggedElement, group.nextSibling);
            } else {
              gradientContainer.insertBefore(draggedElement, group);
            }
            updateGradientColors();
          }
        }
        draggedElement = null;
      });

      // Input event handler
      input.addEventListener("input", (e) => {
        const hex = e.target.value;
        if (hex.length === 7 && /^#[0-9A-Fa-f]{6}$/.test(hex)) {
          preview.style.backgroundColor = hex;
          preview.classList.add("has-color");

          const allGroups = gradientContainer.querySelectorAll(".color-input-group");
          if (group === allGroups[allGroups.length - 1]) {
            addGradientColorInput();
          }

          updateGradientColors();
        } else {
          preview.style.backgroundColor = "";
          preview.classList.remove("has-color");
          updateGradientColors();
        }
      });

      // Blur handler
      input.addEventListener("blur", () => {
        const allGroups = gradientContainer.querySelectorAll(".color-input-group");
        if (allGroups.length > 1 && !input.value) {
          const inputs = gradientContainer.querySelectorAll(".hex-color-input");
          const hasValue = Array.from(inputs).some((inp) => inp.value && inp !== input);
          if (hasValue) {
            group.remove();
            updateGradientColors();
          }
        }
      });

      // Delete button
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "color-delete-btn";
      deleteBtn.innerHTML = "×";
      deleteBtn.type = "button";
      deleteBtn.title = "Supprimer cette couleur";
      deleteBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const allGroups = gradientContainer.querySelectorAll(".color-input-group");
        if (allGroups.length > 1) {
          group.remove();
          updateGradientColors();
        }
      });

      group.appendChild(input);
      group.appendChild(preview);
      group.appendChild(deleteBtn);
      gradientContainer.appendChild(group);

      return {group, input, preview};
    };

    // Créer les champs de couleur avec les valeurs aléatoires
    for (let i = 0; i < numColors; i++) {
      const r = Math.floor(Math.random() * 256);
      const g = Math.floor(Math.random() * 256);
      const b = Math.floor(Math.random() * 256);
      const hex =
        "#" +
        [r, g, b]
          .map((x) => {
            const hex = x.toString(16);
            return hex.length === 1 ? "0" + hex : hex;
          })
          .join("");

      colors.push([r / 255.0, g / 255.0, b / 255.0]);

      // Créer le groupe avec tous les handlers
      const {input, preview} = addGradientColorInput();
      input.value = hex;
      preview.style.backgroundColor = hex;
      preview.classList.add("has-color");
    }

    // Ajouter un champ vide à la fin pour permettre d'ajouter plus de couleurs
    addGradientColorInput();

    // Mettre à jour directement les couleurs du gradient
    shaderParams.gradientColors = colors;
    updateGradientColors();
  }

  // Recharger le shader pour appliquer les nouveaux paramètres
  loadShaders()
    .then(() => {
      console.log("Paramètres randomisés");
      updateShaderParams();
    })
    .catch((error) => {
      console.error("Erreur lors de la randomisation:", error);
    });
}

// Réinitialiser tous les paramètres
function resetAllParameters() {
    // Restaurer les valeurs par défaut
    Object.keys(defaultParams).forEach(key => {
        shaderParams[key] = defaultParams[key];
    });
    
    // Mettre à jour tous les sliders
    const scaleSlider = document.getElementById('scale');
    if (scaleSlider) {
        scaleSlider.value = shaderParams.scale;
        document.getElementById('scaleValue').textContent = shaderParams.scale.toFixed(2);
    }
    
    const phaseXSlider = document.getElementById('phaseX');
    if (phaseXSlider) {
        phaseXSlider.value = shaderParams.phaseX;
        document.getElementById('phaseXValue').textContent = shaderParams.phaseX.toFixed(2);
    }
    
    const velocityYSlider = document.getElementById('velocityY');
    if (velocityYSlider) {
        velocityYSlider.value = shaderParams.velocity;
        document.getElementById('velocityYValue').textContent = shaderParams.velocity.toFixed(2);
    }
    
    const mode1DetailSlider = document.getElementById('mode1Detail');
    if (mode1DetailSlider) {
        mode1DetailSlider.value = shaderParams.mode1Detail;
        document.getElementById('mode1DetailValue').textContent = shaderParams.mode1Detail.toFixed(2);
    }
    
    const mode1TwistSlider = document.getElementById('mode1Twist');
    if (mode1TwistSlider) {
        mode1TwistSlider.value = shaderParams.mode1Twist;
        document.getElementById('mode1TwistValue').textContent = shaderParams.mode1Twist.toFixed(2);
    }
    
    const mode2SpeedSlider = document.getElementById('mode2Speed');
    if (mode2SpeedSlider) {
        mode2SpeedSlider.value = shaderParams.mode2Speed;
        document.getElementById('mode2SpeedValue').textContent = shaderParams.mode2Speed.toFixed(2);
    }
    
    const hueSlider = document.getElementById('hue');
    if (hueSlider) {
        hueSlider.value = shaderParams.hue;
        document.getElementById('hueValue').textContent = Math.round(shaderParams.hue) + '°';
    }
    
    const saturationSlider = document.getElementById('saturation');
    if (saturationSlider) {
        saturationSlider.value = shaderParams.saturation * 100;
        document.getElementById('saturationValue').textContent = Math.round(shaderParams.saturation * 100) + '%';
    }
    
    const vibranceSlider = document.getElementById('vibrance');
    if (vibranceSlider) {
        vibranceSlider.value = shaderParams.vibrance * 100;
        document.getElementById('vibranceValue').textContent = Math.round(shaderParams.vibrance * 100) + '%';
    }
    
    const brightnessSlider = document.getElementById('brightness');
    if (brightnessSlider) {
        brightnessSlider.value = shaderParams.brightness * 100;
        document.getElementById('brightnessValue').textContent = Math.round(shaderParams.brightness * 100) + '%';
    }
    
    const contrastSlider = document.getElementById('contrast');
    if (contrastSlider) {
        contrastSlider.value = shaderParams.contrast * 100;
        document.getElementById('contrastValue').textContent = Math.round(shaderParams.contrast * 100) + '%';
    }
    
    const rgbMultiplierRSlider = document.getElementById('rgbMultiplierR');
    if (rgbMultiplierRSlider) {
        rgbMultiplierRSlider.value = shaderParams.rgbMultiplierR * 100;
        document.getElementById('rgbMultiplierRValue').textContent = Math.round(shaderParams.rgbMultiplierR * 100) + '%';
    }
    
    const rgbMultiplierGSlider = document.getElementById('rgbMultiplierG');
    if (rgbMultiplierGSlider) {
        rgbMultiplierGSlider.value = shaderParams.rgbMultiplierG * 100;
        document.getElementById('rgbMultiplierGValue').textContent = Math.round(shaderParams.rgbMultiplierG * 100) + '%';
    }
    
    const rgbMultiplierBSlider = document.getElementById('rgbMultiplierB');
    if (rgbMultiplierBSlider) {
        rgbMultiplierBSlider.value = shaderParams.rgbMultiplierB * 100;
        document.getElementById('rgbMultiplierBValue').textContent = Math.round(shaderParams.rgbMultiplierB * 100) + '%';
    }
    
    const colorOffsetSlider = document.getElementById('colorOffset');
    if (colorOffsetSlider) {
        colorOffsetSlider.value = shaderParams.colorOffset * 100;
        document.getElementById('colorOffsetValue').textContent = shaderParams.colorOffset.toFixed(1);
    }
    
    const grainAmountSlider = document.getElementById('grainAmount');
    if (grainAmountSlider) {
        grainAmountSlider.value = shaderParams.grainAmount * 100;
        document.getElementById('grainAmountValue').textContent = Math.round(shaderParams.grainAmount * 100) + '%';
    }
    
    const grainSizeSlider = document.getElementById('grainSize');
    if (grainSizeSlider) {
        grainSizeSlider.value = shaderParams.grainSize * 10;
        document.getElementById('grainSizeValue').textContent = shaderParams.grainSize.toFixed(1);
    }
    
    const posterizeSlider = document.getElementById('posterize');
    if (posterizeSlider) {
        posterizeSlider.value = shaderParams.posterize;
        document.getElementById('posterizeValue').textContent = Math.round(shaderParams.posterize);
    }
    
    const scanlinesSlider = document.getElementById('scanlines');
    if (scanlinesSlider) {
        scanlinesSlider.value = shaderParams.scanlines * 100;
        document.getElementById('scanlinesValue').textContent = Math.round(shaderParams.scanlines * 100) + '%';
    }
    
    const scanlineWidthSlider = document.getElementById('scanlineWidth');
    if (scanlineWidthSlider) {
        scanlineWidthSlider.value = shaderParams.scanlineWidth * 10;
        document.getElementById('scanlineWidthValue').textContent = shaderParams.scanlineWidth.toFixed(1);
    }
    
    const movementModeSelect = document.getElementById('movementMode');
    if (movementModeSelect) {
        movementModeSelect.value = shaderParams.movementMode.toString();
    }
    
    const exportResolutionSlider = document.getElementById('exportResolution');
    if (exportResolutionSlider) {
        exportResolutionSlider.value = shaderParams.exportResolution;
        document.getElementById('exportResolutionValue').textContent = shaderParams.exportResolution + 'px';
    }
    
    // Réinitialiser les couleurs du gradient
    const gradientContainer = document.getElementById('gradientColorsContainer');
    if (gradientContainer) {
        // Supprimer tous les champs sauf le premier
        const allGroups = gradientContainer.querySelectorAll('.color-input-group');
        for (let i = 1; i < allGroups.length; i++) {
            allGroups[i].remove();
        }
        
        // Vider le premier champ
        const firstInput = gradientContainer.querySelector('.hex-color-input');
        if (firstInput) {
            firstInput.value = '';
            const firstPreview = gradientContainer.querySelector('.color-preview');
            if (firstPreview) {
                firstPreview.style.backgroundColor = '';
                firstPreview.classList.remove('has-color');
            }
        }
    }
    
    // Recharger le shader pour appliquer le reset
    loadShaders().then(() => {
        console.log('Paramètres réinitialisés');
        updateShaderParams();
    }).catch(error => {
        console.error('Erreur lors de la réinitialisation:', error);
    });
}

function resizeCanvas() {
    const container = canvas.parentElement;
    if (!container) return; // Si le container n'existe pas encore
    
    const maxWidth = container.clientWidth - 40;
    const maxHeight = container.clientHeight - 40;
    
    // Garder le ratio 16:9 ou utiliser tout l'espace disponible
    const aspectRatio = 16 / 9;
    let width = maxWidth;
    let height = maxWidth / aspectRatio;
    
    if (height > maxHeight) {
        height = maxHeight;
        width = maxHeight * aspectRatio;
    }
    
    // S'assurer que le canvas a au moins une taille minimale
    if (width < 100) width = 100;
    if (height < 100) height = 100;
    
    canvas.width = width;
    canvas.height = height;
    displayCanvas.width = width;
    displayCanvas.height = height;
    gl.viewport(0, 0, canvas.width, canvas.height);
    
    // Pas de ressources de post-processing à recréer
    
    if (canvas.width > 0 && canvas.height > 0) {
        console.log('Canvas resize:', width, 'x', height);
    }
}

// Exporter en haute qualité
function exportHighQuality() {
    status.textContent = 'Export en cours...';
    exportButton.disabled = true;
    
    try {
        // Créer un canvas temporaire à haute résolution
        const exportCanvas = document.createElement('canvas');
        const exportGl = exportCanvas.getContext('webgl') || exportCanvas.getContext('experimental-webgl');
        
        if (!exportGl) {
            throw new Error('WebGL non disponible pour l\'export');
        }
        
        // Calculer le ratio d'aspect du canvas d'affichage
        const aspectRatio = canvas.width / canvas.height;
        
        // Calculer les dimensions d'export en gardant le ratio d'aspect
        let exportWidth = shaderParams.exportResolution;
        let exportHeight = Math.round(exportWidth / aspectRatio);
        
        // S'assurer que la hauteur ne dépasse pas la résolution maximale
        if (exportHeight > shaderParams.exportResolution) {
            exportHeight = shaderParams.exportResolution;
            exportWidth = Math.round(exportHeight * aspectRatio);
        }
        
        exportCanvas.width = exportWidth;
        exportCanvas.height = exportHeight;
        
        console.log(`Export: ${exportWidth}x${exportHeight} (ratio: ${aspectRatio.toFixed(2)})`);
        
        // Recompiler le shader avec les paramètres actuels
        // IMPORTANT: Il faut créer le shader avec le contexte exportGl, pas gl
        // Utiliser le shader intégré directement (plus de problème CORS)
        const imageShader = IMAGE_SHADER_SOURCE;
        const modifiedShader = modifyImageShader(imageShader);
        
        // Créer le shader avec le contexte d'export
        const exportFragmentShader = createFragmentShaderForContext(exportGl, modifiedShader);
        const exportShader = createShaderProgramForContext(exportGl, exportFragmentShader);
        
        if (!exportShader) {
            throw new Error('Erreur de compilation du shader pour l\'export');
        }
        
        // Créer un framebuffer pour l'export
        const framebuffer = exportGl.createFramebuffer();
        const texture = exportGl.createTexture();
        exportGl.bindTexture(exportGl.TEXTURE_2D, texture);
        exportGl.texImage2D(exportGl.TEXTURE_2D, 0, exportGl.RGBA, exportWidth, exportHeight, 0, exportGl.RGBA, exportGl.UNSIGNED_BYTE, null);
        exportGl.texParameteri(exportGl.TEXTURE_2D, exportGl.TEXTURE_WRAP_S, exportGl.CLAMP_TO_EDGE);
        exportGl.texParameteri(exportGl.TEXTURE_2D, exportGl.TEXTURE_WRAP_T, exportGl.CLAMP_TO_EDGE);
        exportGl.texParameteri(exportGl.TEXTURE_2D, exportGl.TEXTURE_MIN_FILTER, exportGl.LINEAR);
        exportGl.texParameteri(exportGl.TEXTURE_2D, exportGl.TEXTURE_MAG_FILTER, exportGl.LINEAR);
        
        exportGl.bindFramebuffer(exportGl.FRAMEBUFFER, framebuffer);
        exportGl.framebufferTexture2D(exportGl.FRAMEBUFFER, exportGl.COLOR_ATTACHMENT0, exportGl.TEXTURE_2D, texture, 0);
        
        // Vérifier que le framebuffer est valide
        const framebufferStatus = exportGl.checkFramebufferStatus(exportGl.FRAMEBUFFER);
        if (framebufferStatus !== exportGl.FRAMEBUFFER_COMPLETE) {
            throw new Error(`Framebuffer incomplet: ${framebufferStatus}`);
        }
        
        // Rendre le shader à haute résolution
        exportGl.viewport(0, 0, exportWidth, exportHeight);
        exportGl.useProgram(exportShader);
        
        // Clear avant le rendu
        exportGl.clearColor(0.0, 0.0, 0.0, 1.0);
        exportGl.clear(exportGl.COLOR_BUFFER_BIT);
        
        // Passer les uniforms de base avec les bonnes dimensions
        const resLoc = exportGl.getUniformLocation(exportShader, 'iResolution');
        if (resLoc !== null) exportGl.uniform2f(resLoc, exportWidth, exportHeight);
        
        const timeLoc = exportGl.getUniformLocation(exportShader, 'iTime');
        if (timeLoc !== null) exportGl.uniform1f(timeLoc, (Date.now() - startTime) / 1000.0);
        
        const frameLoc = exportGl.getUniformLocation(exportShader, 'iFrame');
        if (frameLoc !== null) exportGl.uniform1i(frameLoc, frameCount);
        
        const mouseLoc = exportGl.getUniformLocation(exportShader, 'iMouse');
        if (mouseLoc !== null) exportGl.uniform4f(mouseLoc, 0, 0, 0, 0);
        
        // Passer les paramètres du shader via les uniforms
        const scaleLoc = exportGl.getUniformLocation(exportShader, 'uScale');
        if (scaleLoc !== null) exportGl.uniform1f(scaleLoc, shaderParams.scale);
        
        const phaseXLoc = exportGl.getUniformLocation(exportShader, 'uPhaseX');
        if (phaseXLoc !== null) exportGl.uniform1f(phaseXLoc, shaderParams.phaseX);
        
        const velocityLoc = exportGl.getUniformLocation(exportShader, 'uVelocity');
        if (velocityLoc !== null) exportGl.uniform1f(velocityLoc, shaderParams.velocity);
        
        const mode1DetailLoc = exportGl.getUniformLocation(exportShader, 'uMode1Detail');
        if (mode1DetailLoc !== null) exportGl.uniform1f(mode1DetailLoc, shaderParams.mode1Detail);
        
        const mode1TwistLoc = exportGl.getUniformLocation(exportShader, 'uMode1Twist');
        if (mode1TwistLoc !== null) exportGl.uniform1f(mode1TwistLoc, shaderParams.mode1Twist);
        
        const mode2SpeedLoc = exportGl.getUniformLocation(exportShader, 'uMode2Speed');
        if (mode2SpeedLoc !== null) exportGl.uniform1f(mode2SpeedLoc, shaderParams.mode2Speed);
        
        const brightnessLoc = exportGl.getUniformLocation(exportShader, 'uBrightness');
        if (brightnessLoc !== null) exportGl.uniform1f(brightnessLoc, shaderParams.brightness);
        
        const hueLoc = exportGl.getUniformLocation(exportShader, 'uHue');
        if (hueLoc !== null) exportGl.uniform1f(hueLoc, shaderParams.hue);
        
        const saturationLoc = exportGl.getUniformLocation(exportShader, 'uSaturation');
        if (saturationLoc !== null) exportGl.uniform1f(saturationLoc, shaderParams.saturation);
        
        const vibranceLoc = exportGl.getUniformLocation(exportShader, 'uVibrance');
        if (vibranceLoc !== null) exportGl.uniform1f(vibranceLoc, shaderParams.vibrance);
        
        const contrastLoc = exportGl.getUniformLocation(exportShader, 'uContrast');
        if (contrastLoc !== null) exportGl.uniform1f(contrastLoc, shaderParams.contrast);
        
        const rgbMultiplierRLoc = exportGl.getUniformLocation(exportShader, 'uRgbMultiplierR');
        if (rgbMultiplierRLoc !== null) exportGl.uniform1f(rgbMultiplierRLoc, shaderParams.rgbMultiplierR);
        
        const rgbMultiplierGLoc = exportGl.getUniformLocation(exportShader, 'uRgbMultiplierG');
        if (rgbMultiplierGLoc !== null) exportGl.uniform1f(rgbMultiplierGLoc, shaderParams.rgbMultiplierG);
        
        const rgbMultiplierBLoc = exportGl.getUniformLocation(exportShader, 'uRgbMultiplierB');
        if (rgbMultiplierBLoc !== null) exportGl.uniform1f(rgbMultiplierBLoc, shaderParams.rgbMultiplierB);
        
        const colorOffsetLoc = exportGl.getUniformLocation(exportShader, 'uColorOffset');
        if (colorOffsetLoc !== null) exportGl.uniform1f(colorOffsetLoc, shaderParams.colorOffset);
        
        const grainAmountLoc = exportGl.getUniformLocation(exportShader, 'uGrainAmount');
        if (grainAmountLoc !== null) exportGl.uniform1f(grainAmountLoc, shaderParams.grainAmount);
        
        const grainSizeLoc = exportGl.getUniformLocation(exportShader, 'uGrainSize');
        if (grainSizeLoc !== null) exportGl.uniform1f(grainSizeLoc, shaderParams.grainSize);
        
        const posterizeLoc = exportGl.getUniformLocation(exportShader, 'uPosterize');
        if (posterizeLoc !== null) exportGl.uniform1f(posterizeLoc, shaderParams.posterize);
        
        const scanlinesLoc = exportGl.getUniformLocation(exportShader, 'uScanlines');
        if (scanlinesLoc !== null) exportGl.uniform1f(scanlinesLoc, shaderParams.scanlines);
        
        const scanlineWidthLoc = exportGl.getUniformLocation(exportShader, 'uScanlineWidth');
        if (scanlineWidthLoc !== null) exportGl.uniform1f(scanlineWidthLoc, shaderParams.scanlineWidth);
        
        const movementModeLoc = exportGl.getUniformLocation(exportShader, 'uMovementMode');
        if (movementModeLoc !== null) exportGl.uniform1i(movementModeLoc, shaderParams.movementMode);
        
        // Gradient colors - plus besoin car on applique en post-processing
        
        // Channel resolutions
        for (let i = 0; i < 4; i++) {
            const loc = exportGl.getUniformLocation(exportShader, `iChannelResolution[${i}]`);
            if (loc !== null) {
                exportGl.uniform3f(loc, exportWidth, exportHeight, 1.0);
            }
        }
        
        // Créer le quad
        const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
        const buffer = exportGl.createBuffer();
        exportGl.bindBuffer(exportGl.ARRAY_BUFFER, buffer);
        exportGl.bufferData(exportGl.ARRAY_BUFFER, positions, exportGl.STATIC_DRAW);
        
        const positionLoc = exportGl.getAttribLocation(exportShader, 'aPosition');
        if (positionLoc === -1) {
            throw new Error('Attribut aPosition non trouvé dans le shader d\'export');
        }
        exportGl.enableVertexAttribArray(positionLoc);
        exportGl.vertexAttribPointer(positionLoc, 2, exportGl.FLOAT, false, 0, 0);
        
        // Vérifier les erreurs avant le dessin
        let error = exportGl.getError();
        if (error !== exportGl.NO_ERROR) {
            console.warn('Erreur WebGL avant drawArrays:', error);
        }
        
        // Dessiner
        exportGl.drawArrays(exportGl.TRIANGLE_STRIP, 0, 4);
        
        // Vérifier les erreurs après le dessin
        error = exportGl.getError();
        if (error !== exportGl.NO_ERROR) {
            throw new Error(`Erreur WebGL après drawArrays: ${error}`);
        }
        
        // Lire les pixels depuis le framebuffer
        const pixels = new Uint8Array(exportWidth * exportHeight * 4);
        exportGl.readPixels(0, 0, exportWidth, exportHeight, exportGl.RGBA, exportGl.UNSIGNED_BYTE, pixels);
        
        // Vérifier qu'on a bien des pixels (pas tous à zéro)
        let hasData = false;
        for (let i = 0; i < Math.min(1000, pixels.length); i++) {
            if (pixels[i] !== 0) {
                hasData = true;
                break;
            }
        }
        if (!hasData) {
            console.warn('Aucune donnée dans les pixels lus - peut-être que le rendu n\'a pas fonctionné');
        }
        
        // Créer une image à partir des pixels
        const imageCanvas = document.createElement('canvas');
        imageCanvas.width = exportWidth;
        imageCanvas.height = exportHeight;
        const ctx = imageCanvas.getContext('2d');
        const imageData = ctx.createImageData(exportWidth, exportHeight);
        
        // Inverser verticalement (WebGL a Y=0 en bas)
        for (let y = 0; y < exportHeight; y++) {
            for (let x = 0; x < exportWidth; x++) {
                const srcIndex = ((exportHeight - 1 - y) * exportWidth + x) * 4;
                const dstIndex = (y * exportWidth + x) * 4;
                imageData.data[dstIndex] = pixels[srcIndex];
                imageData.data[dstIndex + 1] = pixels[srcIndex + 1];
                imageData.data[dstIndex + 2] = pixels[srcIndex + 2];
                imageData.data[dstIndex + 3] = pixels[srcIndex + 3];
            }
        }
        
        // Appliquer la color ramp si des couleurs sont définies
        if (shaderParams.gradientColors.length > 0) {
            const colors = shaderParams.gradientColors;
            for (let i = 0; i < imageData.data.length; i += 4) {
                // Calculer la luminance du pixel
                const r = imageData.data[i] / 255.0;
                const g = imageData.data[i + 1] / 255.0;
                const b = imageData.data[i + 2] / 255.0;
                const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
                
                // Normaliser entre 0 et 1
                const normalizedLum = Math.max(0, Math.min(1, luminance));
                
                // Trouver les couleurs d'interpolation
                const colorIndex = normalizedLum * (colors.length - 1);
                const index0 = Math.floor(colorIndex);
                const index1 = Math.min(index0 + 1, colors.length - 1);
                const t = colorIndex - index0;
                
                // Interpoler entre les couleurs
                const color0 = colors[index0];
                const color1 = colors[index1];
                imageData.data[i] = Math.round((color0[0] * (1 - t) + color1[0] * t) * 255);
                imageData.data[i + 1] = Math.round((color0[1] * (1 - t) + color1[1] * t) * 255);
                imageData.data[i + 2] = Math.round((color0[2] * (1 - t) + color1[2] * t) * 255);
                // Garder l'alpha tel quel
            }
        }
        
        ctx.putImageData(imageData, 0, 0);
        
        // Télécharger l'image
        imageCanvas.toBlob((blob) => {
            if (!blob) {
                throw new Error('Impossible de créer le blob de l\'image');
            }
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `gradient_${exportWidth}x${exportHeight}_${Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            status.textContent = `Export réussi : ${exportWidth}x${exportHeight}px`;
            exportButton.disabled = false;
        }, 'image/png', 1.0); // Qualité maximale pour PNG
        
        // Nettoyer les ressources
        exportGl.deleteTexture(texture);
        exportGl.deleteFramebuffer(framebuffer);
        exportGl.deleteBuffer(buffer);
        
    } catch (error) {
        console.error('Erreur lors de l\'export:', error);
        status.textContent = 'Erreur lors de l\'export';
        exportButton.disabled = false;
    }
}

// Fonctions de modification de shader supprimées - plus nécessaires pour le dégradé simple
// (Ces fonctions étaient utilisées pour le multi-pass rendering avec SVG, maintenant supprimées)

// Les fonctions suivantes ne sont plus utilisées mais conservées pour référence :
/*
function modifyBufferAShader(source) {
    let modified = source;
    
    // Remplacer l'initialisation : créer un dégradé statique basé sur le SVG
    modified = modified.replace(
        /if\(iFrame<10\)\s*\{[\s\S]*?fragColor = noise;[\s\S]*?return;[\s\S]*?\}/,
        `if(iFrame<10)
    {
        // Initialiser avec un dégradé statique basé sur le SVG
        vec4 svgSample = texture2D(iChannel0, uv);
        float svgMask = smoothstep(0.1, 0.9, dot(svgSample.rgb, vec3(0.299, 0.587, 0.114)));
        svgMask *= svgSample.a;
        
        // Créer un dégradé radial depuis le centre, avec évitement du logo
        vec2 center = vec2(0.5, 0.5);
        float dist = length(uv - center);
        vec4 gradient = vec4(dist * 0.5, dist * 0.3, dist * 0.7, 1.0);
        
        // Retirer le dégradé dans les zones du logo (zone d'évitement)
        fragColor = gradient * (1.0 - svgMask * 0.95);
        return;
    }`
    );
    
    // BlurA lit depuis iChannel0 qui contient maintenant le mélange SVG + état précédent
    // Pas besoin de modifier BlurA, il utilisera automatiquement la texture mixte
    
    // Désactiver les effets de mouvement dans BufferA
    modified = modified.replace(
        /uv = vortex_pair_warp\(uv, iMouse\.xy\*pixelSize, mouseV\*aspect\*1\.4\);/g,
        '// uv = vortex_pair_warp(uv, iMouse.xy*pixelSize, mouseV*aspect*1.4); // Désactivé pour rendu statique'
    );
    
    // Désactiver mouseDelta
    modified = modified.replace(
        /vec2 mouseV = mouseDelta\(\);/g,
        'vec2 mouseV = vec2(0.0); // mouseDelta() désactivé'
    );
    
    // Ajouter l'influence continue du SVG comme zone d'évitement
    // Insérer juste avant la ligne avec clamp
    modified = modified.replace(
        /(\s+fragColor -= fragColor\.argb \* feedBack;[\s\S]*?fragColor \+= fragColor\.gbar \* feedForward;[\s\S]*?)/,
        `$1
    
    // Zone d'évitement : le logo repousse le shader
    vec4 svgInfluence = texture2D(iChannel0, uv);
    float svgLuma = dot(svgInfluence.rgb, vec3(0.299, 0.587, 0.114));
    // Créer un masque avec un lissage pour les bords
    float svgMask = smoothstep(0.15, 0.85, svgLuma);
    svgMask *= svgInfluence.a;
    
    // Retirer le contenu là où le logo est présent (zone d'évitement)
    // Utiliser le paramètre avoidanceStrength (passé via uniform)
    float avoidance = 0.98; // Sera remplacé par un uniform
    fragColor *= (1.0 - svgMask * avoidance);
    
    // Créer un effet de répulsion en utilisant les gradients du SVG
    // Le shader est repoussé depuis les bords du logo
    vec2 svgGrad = vec2(
        texture2D(iChannel0, uv + vec2(pixelSize.x, 0.0)).r - texture2D(iChannel0, uv - vec2(pixelSize.x, 0.0)).r,
        texture2D(iChannel0, uv + vec2(0.0, pixelSize.y)).r - texture2D(iChannel0, uv - vec2(0.0, pixelSize.y)).r
    ) * 0.5;
    
    // Utiliser le gradient pour créer un effet de répulsion
    // Le shader est déplacé dans la direction opposée au gradient
    float gradStrength = length(svgGrad) * svgMask;
    float repulsion = 0.3; // Sera remplacé par un uniform
    vec2 repelDir = normalize(svgGrad + vec2(0.001)); // Éviter division par zéro
    vec2 repelUV = uv - repelDir * gradStrength * pixelSize * 2.0;
    
    // Lire le shader depuis une position repoussée
    vec4 repelColor = BlurA(repelUV, 0);
    fragColor = mix(fragColor, repelColor, gradStrength * repulsion);
    
    `
    );
    
    return modified;
}

// Modifier BufferB pour désactiver les effets temporels (version statique)
function modifyBufferBShader(source) {
    let modified = source;
    
    // Désactiver les effets de temps dans BufferB
    modified = modified.replace(
        /float time = float\(iFrame\)\/60\.;/g,
        'float time = 0.0; // Désactivé pour rendu statique'
    );
    
    // Désactiver les effets de warp dynamiques
    modified = modified.replace(
        /uv = vortex_pair_warp\(uv, iMouse\.xy\*pixelSize, mouseV\*aspect\*1\.4\);/g,
        '// uv = vortex_pair_warp(uv, iMouse.xy*pixelSize, mouseV*aspect*1.4); // Désactivé'
    );
    
    // Désactiver les déformations temporelles basées sur sin/cos
    modified = modified.replace(
        /uv = uv \+ vec2\(sin\(time[^)]*\)[^;]*\)\*pixelSize[^;]*;/g,
        '// uv = uv + vec2(sin(time...)); // Désactivé pour rendu statique'
    );
    
    // Désactiver mouseDelta
    modified = modified.replace(
        /vec2 mouseV = mouseDelta\(\);/g,
        'vec2 mouseV = vec2(0.0); // mouseDelta() désactivé'
    );
    
    return modified;
}
*/

// Modifier le shader Image pour utiliser les paramètres dynamiques
function modifyImageShader(source) {
    let modified = source;
    
    // Supprimer les constantes qui seront remplacées par des uniforms
    modified = modified.replace(
        /const float scale = 6\.;/,
        '// const float scale = 6.; // Remplacé par uniform'
    );
    modified = modified.replace(
        /const float velocity_x = 0\.1;/,
        '// const float velocity_x = 0.1; // Remplacé par uniform (phase X)'
    );
    modified = modified.replace(
        /const float velocity_y = 0\.2;/,
        '// const float velocity_y = 0.2; // Remplacé par uniform'
    );
    modified = modified.replace(
        /const float mode_1_detail = 200\.;/,
        '// const float mode_1_detail = 200.; // Remplacé par uniform'
    );
    modified = modified.replace(
        /const float mode_1_twist = 50\.;/,
        '// const float mode_1_twist = 50.; // Remplacé par uniform'
    );
    modified = modified.replace(
        /const float mode_2_speed = 2\.5;/,
        '// const float mode_2_speed = 2.5; // Remplacé par uniform'
    );
    
    // Protection contre normalize(vec2(0)) qui peut causer des problèmes
    modified = modified.replace(
        /vec2\s+b\s*=\s*normalize\(t\)\s*\*\s*m;/g,
        'vec2 b = length(t) > 0.001 ? normalize(t)*m : vec2(0.0);'
    );
    
    // velocity_y sera remplacé par uVelocity après la modification de f()
    
    // Modifier la fonction f() pour supporter différents modes de mouvement
    // La fonction originale est: sin(p.x+sin(p.y+time*velocity_x)) * sin(p.y*p.x*0.1+time*velocity_y)
    modified = modified.replace(
        /float f\(in vec2 p\)\s*\{[\s\S]*?return sin\(p\.x\+sin\(p\.y\+time\*velocity_x\)\) \* sin\(p\.y\*p\.x\*0\.1\+time\*velocity_y\);[\s\S]*?\}/,
        `float f(in vec2 p)
{
    // uMovementMode contrôle le type de mouvement
    // Mode 0: Par défaut (circulaire) - comportement original
    // Mode 1: Linéaire - mouvement directionnel
    // Mode 2: Tourbillon - rotation avec effet de vortex
    // Mode 3: Résonance - oscillations complexes avec interférences
    // Mode 4: Perturbation - mouvements chaotiques mais contrôlés
    // Mode 5: Éclatement - expansion depuis plusieurs points
    // Mode 6: Écoulement - mouvement fluide comme de l'eau
    // Mode 7: Statique - pas de mouvement temporel
    
    float timeOffset = 0.0;
    vec2 pOffset = vec2(0.0);
    
    if (uMovementMode == 0) {
        // Par défaut: mouvement circulaire avec phase
        timeOffset = time * uVelocity + uPhaseX;
        return sin(p.x + sin(p.y + timeOffset)) * sin(p.y * p.x * 0.1 + time * uVelocity);
    } else if (uMovementMode == 1) {
        // Linéaire: mouvement dans une direction
        timeOffset = time * uVelocity;
        pOffset = vec2(timeOffset * 0.5, timeOffset * 0.3);
        return sin((p.x + pOffset.x) + sin((p.y + pOffset.y) + uPhaseX)) * sin((p.y + pOffset.y) * (p.x + pOffset.x) * 0.1);
    } else if (uMovementMode == 2) {
        // Tourbillon: rotation avec effet de vortex (plus intense vers le centre)
        float dist = length(p);
        float angle = atan(p.y, p.x) + time * uVelocity * 2.0 / (dist + 0.5);
        float vortex = dist * 0.3;
        pOffset = vec2(cos(angle), sin(angle)) * vortex;
        return sin((p.x + pOffset.x) + sin((p.y + pOffset.y) + uPhaseX)) * sin((p.y + pOffset.y) * (p.x + pOffset.x) * 0.1);
    } else if (uMovementMode == 3) {
        // Résonance: oscillations complexes avec interférences (ondes qui se croisent)
        float freq1 = 2.0;
        float freq2 = 3.0;
        float wave1 = sin(p.x * freq1 + time * uVelocity) * sin(p.y * freq1 + time * uVelocity * 0.7);
        float wave2 = cos(p.x * freq2 + time * uVelocity * 1.3) * cos(p.y * freq2 + time * uVelocity * 0.9);
        pOffset = vec2(wave1 * 0.2 + wave2 * 0.15, wave1 * 0.15 - wave2 * 0.2);
        return sin((p.x + pOffset.x) + sin((p.y + pOffset.y) + uPhaseX)) * sin((p.y + pOffset.y) * (p.x + pOffset.x) * 0.1);
    } else if (uMovementMode == 4) {
        // Perturbation: mouvements chaotiques mais contrôlés (bruit directionnel)
        float noise1 = sin(p.x * 3.14159 + time * uVelocity) * cos(p.y * 2.71828 + time * uVelocity * 1.1);
        float noise2 = cos(p.x * 2.71828 - time * uVelocity * 0.8) * sin(p.y * 3.14159 - time * uVelocity);
        pOffset = vec2(noise1 * 0.25, noise2 * 0.25);
        return sin((p.x + pOffset.x) + sin((p.y + pOffset.y) + uPhaseX)) * sin((p.y + pOffset.y) * (p.x + pOffset.x) * 0.1);
    } else if (uMovementMode == 5) {
        // Éclatement: expansion depuis plusieurs points (effet d'explosion)
        vec2 center1 = vec2(0.3, 0.3);
        vec2 center2 = vec2(-0.3, -0.3);
        vec2 dir1 = normalize(p - center1);
        vec2 dir2 = normalize(p - center2);
        float dist1 = length(p - center1);
        float dist2 = length(p - center2);
        float expansion1 = sin(time * uVelocity * 2.0) * dist1 * 0.3;
        float expansion2 = cos(time * uVelocity * 2.0) * dist2 * 0.3;
        pOffset = dir1 * expansion1 + dir2 * expansion2;
        return sin((p.x + pOffset.x) + sin((p.y + pOffset.y) + uPhaseX)) * sin((p.y + pOffset.y) * (p.x + pOffset.x) * 0.1);
    } else if (uMovementMode == 6) {
        // Écoulement: mouvement fluide comme de l'eau (courants sinueux)
        float flowX = sin(p.y * 1.5 + time * uVelocity) * 0.4;
        float flowY = cos(p.x * 1.5 + time * uVelocity * 0.7) * 0.4;
        float curl = sin(p.x * p.y * 2.0 + time * uVelocity) * 0.2;
        pOffset = vec2(flowX + curl, flowY - curl);
        return sin((p.x + pOffset.x) + sin((p.y + pOffset.y) + uPhaseX)) * sin((p.y + pOffset.y) * (p.x + pOffset.x) * 0.1);
    } else {
        // Statique: pas de mouvement temporel
        return sin(p.x + sin(p.y + uPhaseX)) * sin(p.y * p.x * 0.1);
    }
}`
    );
    
    // Maintenant remplacer velocity_x partout ailleurs (dans field() notamment) par uPhaseX
    modified = modified.replace(
        /\bvelocity_x\b/g,
        'uPhaseX'
    );
    
    // Remplacer velocity_y par uVelocity partout
    modified = modified.replace(
        /\bvelocity_y\b/g,
        'uVelocity'
    );
    modified = modified.replace(
        /\bmode_1_detail\b/g,
        'uMode1Detail'
    );
    modified = modified.replace(
        /\bmode_1_twist\b/g,
        'uMode1Twist'
    );
    modified = modified.replace(
        /\bmode_2_speed\b/g,
        'uMode2Speed'
    );
    
    // Le shader original utilise fieldviz() mais ne l'appelle jamais
    // On garde juste le code original qui fonctionne
    
    // Modifier les lignes 58-59 dans field() pour supporter différents modes de mouvement
    // Ces lignes ajoutent des oscillations: p.x += sin(time*mode_2_speed/10.)/10.;
    modified = modified.replace(
        /(\s+p \+= \(mode_1_twist\*0\.01\)\*t \+ g\*\(1\.\/mode_1_detail\);[\s\S]*?)(\s+p\.x = p\.x \+ sin\( time\*mode_2_speed\/10\.\)\/10\.;[\s\S]*?p\.y = p\.y \+ cos\(time\*mode_2_speed\/10\.\)\/10\.;)/,
        `$1
    
    // Application du mode de mouvement dans la boucle field()
    if (uMovementMode == 0) {
        // Par défaut: oscillations circulaires
        p.x = p.x + sin(time * uMode2Speed / 10.0) / 10.0;
        p.y = p.y + cos(time * uMode2Speed / 10.0) / 10.0;
    } else if (uMovementMode == 1) {
        // Linéaire: déplacement progressif
        p.x = p.x + time * uVelocity * 0.1;
        p.y = p.y + time * uVelocity * 0.05;
    } else if (uMovementMode == 2) {
        // Tourbillon: rotation avec effet vortex (plus rapide au centre)
        float dist = length(p);
        float angle = time * uMode2Speed / (dist * 5.0 + 1.0);
        float px = p.x;
        p.x = px * cos(angle) - p.y * sin(angle);
        p.y = px * sin(angle) + p.y * cos(angle);
    } else if (uMovementMode == 3) {
        // Résonance: oscillations complexes avec interférences
        float osc1 = sin(p.x * 2.0 + time * uMode2Speed / 10.0);
        float osc2 = cos(p.y * 2.0 + time * uMode2Speed / 12.0);
        float osc3 = sin((p.x + p.y) * 1.5 + time * uMode2Speed / 8.0);
        p.x = p.x + (osc1 + osc3) / 20.0;
        p.y = p.y + (osc2 - osc3) / 20.0;
    } else if (uMovementMode == 4) {
        // Perturbation: mouvements chaotiques mais contrôlés
        float chaosX = sin(p.x * 5.0 + time * uMode2Speed / 7.0) * cos(p.y * 3.0 + time * uMode2Speed / 9.0);
        float chaosY = cos(p.x * 3.0 - time * uMode2Speed / 11.0) * sin(p.y * 5.0 - time * uMode2Speed / 6.0);
        p.x = p.x + chaosX / 18.0;
        p.y = p.y + chaosY / 18.0;
    } else if (uMovementMode == 5) {
        // Éclatement: expansion depuis plusieurs points
        vec2 center1 = vec2(0.2, 0.2);
        vec2 center2 = vec2(-0.2, -0.2);
        vec2 dir1 = normalize(p - center1);
        vec2 dir2 = normalize(p - center2);
        float dist1 = length(p - center1);
        float dist2 = length(p - center2);
        float burst1 = sin(time * uMode2Speed / 5.0) * dist1 * 0.15;
        float burst2 = cos(time * uMode2Speed / 5.0) * dist2 * 0.15;
        p.x = p.x + (dir1.x * burst1 + dir2.x * burst2) / 10.0;
        p.y = p.y + (dir1.y * burst1 + dir2.y * burst2) / 10.0;
    } else if (uMovementMode == 6) {
        // Écoulement: mouvement fluide comme de l'eau
        float flowX = sin(p.y * 2.0 + time * uMode2Speed / 8.0);
        float flowY = cos(p.x * 2.0 + time * uMode2Speed / 10.0);
        float swirl = sin(p.x * p.y * 3.0 + time * uMode2Speed / 12.0) * 0.5;
        p.x = p.x + (flowX + swirl) / 16.0;
        p.y = p.y + (flowY - swirl) / 16.0;
    }
    // Mode 7 (statique): pas de modification de p`
    );
    
    // Ajouter les fonctions de conversion de couleur
    modified = modified.replace(
        /void mainImage\( out vec4 fragColor, in vec2 fragCoord \)/,
        `// Conversion RGB vers HSL
vec3 rgb2hsl(vec3 c) {
    float maxVal = max(max(c.r, c.g), c.b);
    float minVal = min(min(c.r, c.g), c.b);
    float delta = maxVal - minVal;
    
    float h = 0.0;
    if (delta > 0.0001) {
        if (maxVal == c.r) {
            h = mod((c.g - c.b) / delta, 6.0);
        } else if (maxVal == c.g) {
            h = (c.b - c.r) / delta + 2.0;
        } else {
            h = (c.r - c.g) / delta + 4.0;
        }
        h /= 6.0;
    }
    
    float l = (maxVal + minVal) * 0.5;
    float s = (delta > 0.0001) ? delta / (1.0 - abs(2.0 * l - 1.0)) : 0.0;
    
    return vec3(h, s, l);
}

// Conversion HSL vers RGB
vec3 hsl2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
}

// Appliquer la vibrance (saturation sélective)
vec3 applyVibrance(vec3 color, float vibrance) {
    float luminance = dot(color, vec3(0.299, 0.587, 0.114));
    float colorfulness = length(color - vec3(luminance));
    float factor = 1.0 + vibrance * (1.0 - colorfulness);
    return mix(vec3(luminance), color, factor);
}

// Film grain basé sur glsl-film-grain (Matt DesLauriers / Martins Upitis)
// Source: https://maximmcnair.com/p/webgl-film-grain

// Hash function pour le bruit (version simplifiée mais efficace)
float hash(vec2 p) {
    return fract(sin(dot(p.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

float hash3(vec3 p) {
    return hash(p.xy + vec2(p.z * 17.0, p.z * 23.0));
}

// Noise 3D simplifié (basé sur hash + interpolation)
float noise3D(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    
    float n000 = hash3(i);
    float n100 = hash3(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash3(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash3(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash3(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash3(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash3(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash3(i + vec3(1.0, 1.0, 1.0));
    
    float n00 = mix(n000, n100, f.x);
    float n01 = mix(n010, n110, f.x);
    float n10 = mix(n001, n101, f.x);
    float n11 = mix(n011, n111, f.x);
    
    float n0 = mix(n00, n01, f.y);
    float n1 = mix(n10, n11, f.y);
    
    return mix(n0, n1, f.z);
}

// Simplex noise 3D simplifié (approximation)
float snoise3D(vec3 v) {
    return noise3D(v) * 2.0 - 1.0;
}

// Perlin noise 3D simplifié (approximation)
float pnoise3D(vec3 P, vec3 rep) {
    // Utiliser une version simplifiée basée sur noise3D
    return noise3D(P);
}

// Fonction de grain (basée sur glsl-film-grain)
float grain(vec2 texCoord, vec2 resolution, float frame, float multiplier) {
    vec2 mult = texCoord * resolution;
    float offset = snoise3D(vec3(mult / multiplier, frame));
    float n1 = pnoise3D(vec3(mult, offset), vec3(resolution, 1.0));
    return n1 / 2.0 + 0.5;
}

// Blend mode soft light (adaptatif selon luminance)
vec3 blendSoftLight(vec3 base, vec3 blend) {
    return mix(
        sqrt(base) * (2.0 * blend - 1.0) + 2.0 * base * (1.0 - blend),
        2.0 * base * blend + base * base * (1.0 - 2.0 * blend),
        step(base, vec3(0.5))
    );
}

// Luminance (renommé pour éviter conflit avec la constante luma du shader)
float getLuminance(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
}

// Appliquer le grain de film (basé sur l'article)
vec3 applyGrain(vec3 color, vec2 uv, vec2 resolution, float amount, float size, float time) {
    if (amount <= 0.0) return color;
    
    // Générer le grain
    float g = grain(uv, resolution / size, time * 0.1, size);
    vec3 grainColor = vec3(g);
    
    // Blend avec soft light
    vec3 blended = blendSoftLight(color, grainColor);
    
    // Obtenir la luminance du pixel original
    float luminance = getLuminance(color);
    
    // Réduire le grain selon la luminance (moins visible sur les zones sombres)
    float response = smoothstep(0.05, 0.5, luminance);
    vec3 finalColor = mix(blended, color, pow(response, 2.0));
    
    // Mix final avec le montant de grain (peut aller jusqu'à 2.0 pour plus d'intensité)
    // Si amount > 1.0, on exagère l'effet au-delà du mix normal
    if (amount > 1.0) {
        vec3 baseMix = mix(color, finalColor, 1.0);
        float excess = amount - 1.0;
        return mix(baseMix, finalColor, excess);
    } else {
        return mix(color, finalColor, amount);
    }
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )`
    );
    
    // Utiliser les uniforms dans le code
    // IMPORTANT: Faire le remplacement de scale APRÈS la modification de mainImage
    modified = modified.replace(
        /\bscale\b/g,
        'uScale'
    );
    
    // Le gradient sera appliqué en post-processing, pas dans le shader principal
    // On garde le code original pour calculer la valeur de base
    
    // Ajouter les corrections de couleur après
    modified = modified.replace(
        /(\s+fragColor = vec4\(col,1\.0\);)/,
        `    
    // Appliquer les corrections de couleur
    // 1. Multiplicateurs RGB individuels
    col.r *= uRgbMultiplierR;
    col.g *= uRgbMultiplierG;
    col.b *= uRgbMultiplierB;
    
    // 2. Offset de couleur (ajout/soustraction uniforme)
    col.rgb += uColorOffset;
    
    // 3. Contraste (centre autour de 0.5)
    col.rgb = (col.rgb - 0.5) * uContrast + 0.5;
    
    // 4. Teinte (rotation HSL)
    vec3 hsl = rgb2hsl(col);
    hsl.x = mod(hsl.x + uHue / 360.0, 1.0);
    col = hsl2rgb(hsl);
    
    // 5. Saturation
    float gray = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(gray), col, uSaturation);
    
    // 6. Vibrance (saturation sélective)
    col = applyVibrance(col, uVibrance);
    
    // 7. Film grain (basé sur glsl-film-grain)
    col = applyGrain(col, uv, iResolution.xy, uGrainAmount, uGrainSize, time);
    
    // 8. Posterization (quantification des couleurs)
    if (uPosterize < 256.0) {
        float levels = max(2.0, uPosterize);
        col = floor(col * levels) / levels;
    }
    
    // 9. Scanlines (effet rétro)
    if (uScanlines > 0.0) {
        vec2 uv = fragCoord / iResolution.xy;
        // La largeur contrôle la fréquence : plus grand = lignes plus espacées (plus larges)
        float frequency = iResolution.y / max(uScanlineWidth, 0.1);
        float scanline = sin(uv.y * frequency * 3.14159) * 0.5 + 0.5;
        scanline = pow(scanline, 10.0); // Lignes plus nettes
        col.rgb *= mix(1.0, scanline * 0.8 + 0.2, uScanlines);
    }
    
    $1`
    );
    
    return modified;
}

// Contenu du shader intégré directement (évite les problèmes CORS avec file://)
const IMAGE_SHADER_SOURCE = `/*
	Thank you to "MartinRGB" for the core elements from:
    https://www.shadertoy.com/view/DttSRB
*/

#define time iTime

const float arrow_density = 4.5;
const float arrow_length = .45;

const int iterationTime1 = 20;
const int iterationTime2 = 20;
const int vector_field_mode = 0;
const float scale = 6.;

const float velocity_x = 0.1;
const float velocity_y = 0.2;

const float mode_2_speed = 2.5;
const float mode_1_detail = 200.;
const float mode_1_twist = 50.;

const bool isArraw = true;

const vec3 luma = vec3(0.2126, 0.7152, 0.0722);


float f(in vec2 p)
{
    return sin(p.x+sin(p.y+time*velocity_x)) * sin(p.y*p.x*0.1+time*velocity_y);
}


struct Field {
    vec2 vel;
    vec2 pos;
};

//---------------Field to visualize defined here-----------------

Field field(in vec2 p,in int mode)
{
    Field field;
    if(mode == 0){
    	vec2 ep = vec2(0.05,0.);
        vec2 rz= vec2(0);
        //# centered grid sampling
        for( int i=0; i<iterationTime1; i++ )
        {
            float t0 = f(p);
            float t1 = f(p + ep.xy);
            float t2 = f(p + ep.yx);
            vec2 g = vec2((t1-t0), (t2-t0))/ep.xx;
            vec2 t = vec2(-g.y,g.x);
            
            //# need update 'p' for next iteration,but give it some change.
            p += (mode_1_twist*0.01)*t + g*(1./mode_1_detail);
            p.x = p.x + sin( time*mode_2_speed/10.)/10.;
            p.y = p.y + cos(time*mode_2_speed/10.)/10.;
            rz= g; 
        }
        field.vel = rz;
        return field;
    }
    
    if(mode == 1){
        vec2 ep = vec2(0.05,0.);
        vec2 rz= vec2(0);
        //# centered grid sampling
        for( int i=0; i<iterationTime1; i++ )
        {
            float t0 = f(p);
            float t1 = f(p + ep.xy);
            float t2 = f(p + ep.yx);
            vec2 g = vec2((t1-t0), (t2-t0))/ep.xx;
            vec2 t = vec2(-g.y,g.x);

            //# need update 'p' for next iteration,but give it some change.
            p += (mode_1_twist*0.01)*t + g*(1./mode_1_detail);
            p.x = p.x + sin( time*mode_2_speed/10.)/10.;
            p.y = p.y + cos(time*mode_2_speed/10.)/10.;
            rz= g;
        }
        
        field.vel = rz;
        // add curved effect into curved mesh
        for(int i=1; i<iterationTime2; i++){
            //# try comment these 2 lines,will give more edge effect
            p.x+=0.3/float(i)*sin(float(i)*3.*p.y+time*mode_2_speed) + 0.5;
            p.y+=0.3/float(i)*cos(float(i)*3.*p.x + time*mode_2_speed) + 0.5;
        }
        field.pos = p;
        return field;
    }
    
    return field;
}
//---------------------------------------------------------------

float segm(in vec2 p, in vec2 a, in vec2 b) //from iq
{
	vec2 pa = p - a;
	vec2 ba = b - a;
	float h = clamp(dot(pa,ba)/dot(ba,ba), 0., 1.);
	return length(pa - ba*h)*20.*arrow_density;
}

float fieldviz(in vec2 p,in int mode)
{
    vec2 ip = floor(p*arrow_density)/arrow_density + .5/arrow_density;   
    vec2 t = field(ip,mode).vel;
    float m = min(0.1,pow(length(t),0.5)*(arrow_length/arrow_density));
    vec2 b = normalize(t)*m;
    float rz = segm(p, ip, ip+b);
    vec2 prp = (vec2(-b.y,b.x));
    rz = min(rz,segm(p, ip+b, ip+b*0.65+prp*0.3));
    return clamp(min(rz,segm(p, ip+b, ip+b*0.65-prp*0.3)),0.,1.);
}


vec3 getRGB(in Field fld,in int mode){

    if(mode == 0){
        vec2 p = fld.vel;
        vec3 origCol = vec3(p * 0.5 + 0.5, 1.5);
        return origCol;
    }
    
    if(mode == 1){
        vec2 p = fld.pos;
        float r=cos(p.x+p.y+1.)*.5+.5;
        float g=sin(p.x+p.y+1.)*.5+.5;
        float b=(sin(p.x+p.y)+cos(p.x+p.y))*.3+.5;
        vec3 col = sin(vec3(-.3,0.1,0.5)+p.x-p.y)*0.65+0.35;
        return vec3(r,g,b);
    }

}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
	vec2 p = fragCoord.xy / iResolution.xy-0.5 ;
	p.x *= iResolution.x/iResolution.y;
    p *= scale;
    
    vec2 uv = fragCoord.xy / iResolution.xy;
    vec3 col;
    float fviz;
    
    int vector_mode = 0;
    Field fld = field(p,vector_mode);
    col = getRGB(fld,vector_mode) * 0.85;    
	fragColor = vec4(col,1.0);
}`;

// Charger les shaders
async function loadShaders() {
    try {
        // Utiliser le shader intégré directement (plus de problème CORS avec file://)
        const imageShader = IMAGE_SHADER_SOURCE;
        
        if (!imageShader) {
            throw new Error('Impossible de charger le shader intégré');
        }

        // Modifier le shader pour appliquer les effets
        const modifiedImageShader = modifyImageShader(imageShader);
        
        console.log('✅ Shader Image.frag chargé, longueur:', imageShader.length);
        console.log('✅ Shader modifié, longueur:', modifiedImageShader.length);
        
        // Vérifier que les remplacements ont bien fonctionné
        if (!modifiedImageShader.includes('uScale')) {
            console.error('❌ ERREUR: uScale non trouvé dans le shader modifié !');
        } else {
            console.log('✅ uScale trouvé dans le shader modifié');
        }
        if (!modifiedImageShader.includes('uPhaseX')) {
            console.error('❌ ERREUR: uPhaseX non trouvé dans le shader modifié !');
        } else {
            console.log('✅ uPhaseX trouvé dans le shader modifié');
        }

        // Compiler uniquement le shader Image
        const fragmentShader = createFragmentShader(modifiedImageShader);
        if (!fragmentShader) {
            throw new Error('Erreur lors de la compilation du fragment shader');
        }
        
        shaderPrograms.image = createShaderProgram(fragmentShader);
        
        if (!shaderPrograms.image) {
            throw new Error('Erreur lors de la création du programme shader');
        }

        // Plus besoin de créer les buffers complexes pour ce shader simple
        
        status.textContent = 'Shader chargé. Prêt à générer un dégradé.';
        console.log('✅ Shader program créé avec succès');
        console.log('Uniforms disponibles:');
        console.log('  uScale:', gl.getUniformLocation(shaderPrograms.image, 'uScale') !== null);
        console.log('  uPhaseX:', gl.getUniformLocation(shaderPrograms.image, 'uPhaseX') !== null);
        console.log('  uVelocity:', gl.getUniformLocation(shaderPrograms.image, 'uVelocity') !== null);
        console.log('  uMode1Detail:', gl.getUniformLocation(shaderPrograms.image, 'uMode1Detail') !== null);
        console.log('  uMode1Twist:', gl.getUniformLocation(shaderPrograms.image, 'uMode1Twist') !== null);
        console.log('  uMode2Speed:', gl.getUniformLocation(shaderPrograms.image, 'uMode2Speed') !== null);
        console.log('  uBrightness:', gl.getUniformLocation(shaderPrograms.image, 'uBrightness') !== null);
        console.log('  uHue:', gl.getUniformLocation(shaderPrograms.image, 'uHue') !== null);
        console.log('  uSaturation:', gl.getUniformLocation(shaderPrograms.image, 'uSaturation') !== null);
        console.log('  uVibrance:', gl.getUniformLocation(shaderPrograms.image, 'uVibrance') !== null);
        console.log('  uContrast:', gl.getUniformLocation(shaderPrograms.image, 'uContrast') !== null);
        console.log('  uRgbMultiplierR:', gl.getUniformLocation(shaderPrograms.image, 'uRgbMultiplierR') !== null);
        console.log('  uRgbMultiplierG:', gl.getUniformLocation(shaderPrograms.image, 'uRgbMultiplierG') !== null);
        console.log('  uRgbMultiplierB:', gl.getUniformLocation(shaderPrograms.image, 'uRgbMultiplierB') !== null);
        console.log('  uColorOffset:', gl.getUniformLocation(shaderPrograms.image, 'uColorOffset') !== null);
        console.log('  uGrainAmount:', gl.getUniformLocation(shaderPrograms.image, 'uGrainAmount') !== null);
        console.log('  uGrainSize:', gl.getUniformLocation(shaderPrograms.image, 'uGrainSize') !== null);
        console.log('  uMovementMode:', gl.getUniformLocation(shaderPrograms.image, 'uMovementMode') !== null);
        console.log('  iResolution:', gl.getUniformLocation(shaderPrograms.image, 'iResolution') !== null);
        console.log('  iTime:', gl.getUniformLocation(shaderPrograms.image, 'iTime') !== null);
    } catch (error) {
        console.error('Erreur lors du chargement du shader:', error);
        status.textContent = 'Erreur lors du chargement du shader: ' + error.message;
        throw error; // Propager l'erreur pour que le .catch() puisse la gérer
    }
}

// Créer un shader de fragment (utilise le contexte global gl)
function createFragmentShader(source) {
    return createFragmentShaderForContext(gl, source);
}

// Créer un shader de fragment pour un contexte WebGL spécifique
function createFragmentShaderForContext(webglContext, source) {
    // Header WebGL 1 compatible avec Shadertoy
    // Ajouter les uniforms personnalisés dans le header
    const header = `
        precision highp float;
        uniform vec2 iResolution;
        uniform float iTime;
        uniform int iFrame;
        uniform vec4 iMouse;
        uniform sampler2D iChannel0;
        uniform sampler2D iChannel1;
        uniform sampler2D iChannel2;
        uniform sampler2D iChannel3;
        uniform vec3 iChannelResolution[4];
        uniform float uScale;
        uniform float uPhaseX;
        uniform float uVelocity;
        uniform float uMode1Detail;
        uniform float uMode1Twist;
        uniform float uMode2Speed;
        uniform float uBrightness;
        uniform float uHue;
        uniform float uSaturation;
        uniform float uVibrance;
        uniform float uContrast;
        uniform float uRgbMultiplierR;
        uniform float uRgbMultiplierG;
        uniform float uRgbMultiplierB;
        uniform float uColorOffset;
        uniform float uGrainAmount;
        uniform float uGrainSize;
        uniform float uPosterize;
        uniform float uScanlines;
        uniform float uScanlineWidth;
        uniform int uMovementMode;
        varying vec2 vTexCoord;
    `;
    
    // Remplacer mainImage pour qu'il fonctionne avec notre système
    let modifiedSource = source;
    
    // Remplacer texture() par texture2D() pour WebGL 1 (avant toute autre modification)
    modifiedSource = modifiedSource.replace(/\btexture\s*\(/g, 'texture2D(');
    
    // Variable globale pour le résultat (WebGL 1 ne supporte pas les paramètres out)
    modifiedSource = `
        vec4 _fragColorResult;
        ${modifiedSource}
    `;
    
    // Remplacer la signature mainImage pour utiliser la variable globale
    modifiedSource = modifiedSource.replace(
        /void\s+mainImage\s*\(\s*out\s+vec4\s+fragColor\s*,\s*in\s+vec2\s+fragCoord\s*\)/g, 
        'void mainImage_compat(vec2 fragCoord)'
    );
    
    // IMPORTANT: Ordre des remplacements
    // 1. Remplacer les swizzles Shadertoy spécifiques (argb, gbar) AVANT les autres remplacements
    modifiedSource = modifiedSource.replace(
        /\bfragColor\.argb/g,
        'vec4(_fragColorResult.a, _fragColorResult.r, _fragColorResult.g, _fragColorResult.b)'
    );
    modifiedSource = modifiedSource.replace(
        /\bfragColor\.gbar/g,
        'vec4(_fragColorResult.g, _fragColorResult.b, _fragColorResult.a, _fragColorResult.r)'
    );
    
    // 2. Remplacer les accès aux composants de fragColor (fragColor.r, fragColor.g, etc.)
    modifiedSource = modifiedSource.replace(
        /\bfragColor\.([rgba])/g,
        '_fragColorResult.$1'
    );
    
    // 3. Remplacer les assignations aux composants (fragColor.r =, fragColor.g =, etc.)
    modifiedSource = modifiedSource.replace(
        /\bfragColor\.([rgba])\s*=/g,
        '_fragColorResult.$1 ='
    );
    
    // 4. Remplacer les opérations composées (fragColor +=, fragColor -=, etc.) AVANT les assignations simples
    modifiedSource = modifiedSource.replace(
        /\bfragColor\s*([+\-*/])=/g,
        '_fragColorResult $1='
    );
    
    // 5. Remplacer TOUTES les autres occurrences de fragColor (dans les expressions, paramètres, etc.)
    // Utiliser un lookahead négatif pour éviter de remplacer ce qui a déjà été remplacé
    modifiedSource = modifiedSource.replace(
        /\bfragColor\b/g,
        '_fragColorResult'
    );
    
    const fullSource = `
        ${header}
        ${modifiedSource}
        
        void main() {
            vec2 fragCoord = vTexCoord * iResolution;
            _fragColorResult = vec4(0.0, 0.0, 0.0, 1.0); // Initialiser avec du noir opaque
            mainImage_compat(fragCoord);
            // Appliquer la luminosité après toutes les transformations de couleur
            _fragColorResult.rgb *= uBrightness;
            gl_FragColor = _fragColorResult;
        }
    `;
    
    const shader = webglContext.createShader(webglContext.FRAGMENT_SHADER);
    webglContext.shaderSource(shader, fullSource);
    webglContext.compileShader(shader);
    
    if (!webglContext.getShaderParameter(shader, webglContext.COMPILE_STATUS)) {
        const errorLog = webglContext.getShaderInfoLog(shader);
        console.error('Erreur de compilation shader:', errorLog);
        // Afficher les premières lignes pour debug
        const lines = fullSource.split('\n');
        console.error('Premières lignes:', lines.slice(0, 50).join('\n'));
        // Afficher le code complet pour debug
        console.error('Code complet du shader:', fullSource);
        webglContext.deleteShader(shader);
        return null;
    }
    
    return shader;
}

// Créer un programme shader (utilise le contexte global gl)
function createShaderProgram(fragmentShader) {
    return createShaderProgramForContext(gl, fragmentShader);
}

// Créer un programme shader pour un contexte WebGL spécifique
function createShaderProgramForContext(webglContext, fragmentShader) {
    if (!fragmentShader) return null;
    
    // WebGL 1 compatible
    const vertexShaderSource = `
        attribute vec2 aPosition;
        varying vec2 vTexCoord;
        void main() {
            gl_Position = vec4(aPosition, 0.0, 1.0);
            vTexCoord = (aPosition + 1.0) * 0.5;
        }
    `;
    
    const vertexShader = webglContext.createShader(webglContext.VERTEX_SHADER);
    webglContext.shaderSource(vertexShader, vertexShaderSource);
    webglContext.compileShader(vertexShader);
    
    if (!webglContext.getShaderParameter(vertexShader, webglContext.COMPILE_STATUS)) {
        console.error('Erreur vertex shader:', webglContext.getShaderInfoLog(vertexShader));
        return null;
    }
    
    const program = webglContext.createProgram();
    webglContext.attachShader(program, vertexShader);
    webglContext.attachShader(program, fragmentShader);
    webglContext.linkProgram(program);
    
    if (!webglContext.getProgramParameter(program, webglContext.LINK_STATUS)) {
        console.error('Erreur de lien:', webglContext.getProgramInfoLog(program));
        return null;
    }
    
    return program;
}

// Créer une texture de bruit
function createNoiseTexture() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(size, size);
    
    for (let i = 0; i < imageData.data.length; i += 4) {
        const value = Math.random() * 255;
        imageData.data[i] = value;     // R
        imageData.data[i + 1] = value; // G
        imageData.data[i + 2] = value; // B
        imageData.data[i + 3] = 255;   // A
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    
    return texture;
}

// Créer les buffers pour les passes multiples avec double buffering
function createBuffers() {
    // Nettoyer les buffers existants si nécessaire
    if (buffers.channel0) {
        for (let i = 0; i < 4; i++) {
            const buffer = buffers[`channel${i}`];
            if (buffer) {
                gl.deleteTexture(buffer.textureRead);
                gl.deleteTexture(buffer.textureWrite);
                gl.deleteFramebuffer(buffer.framebuffer);
            }
        }
    }
    
    const size = shaderParams.resolution; // Taille des buffers internes (résolution améliorée)
    
    // Double buffering : chaque channel a deux textures (read et write)
    for (let i = 0; i < 4; i++) {
        // Texture de lecture (read)
        const textureRead = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, textureRead);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        
        // Texture d'écriture (write)
        const textureWrite = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, textureWrite);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        
        // Framebuffer pour écrire dans textureWrite
        const framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textureWrite, 0);
        
        buffers[`channel${i}`] = { 
            textureRead, 
            textureWrite, 
            framebuffer,
            // Pour compatibilité avec l'ancien code
            texture: textureRead  // Par défaut, on lit depuis textureRead
        };
    }
    
    // Créer la texture de bruit pour iChannel2
    buffers.noiseTexture = createNoiseTexture();
}

// Échanger les buffers (swap read/write)
function swapBuffers() {
    for (let i = 0; i < 4; i++) {
        const buffer = buffers[`channel${i}`];
        // Échanger read et write
        const temp = buffer.textureRead;
        buffer.textureRead = buffer.textureWrite;
        buffer.textureWrite = temp;
        buffer.texture = buffer.textureRead; // Mettre à jour la texture par défaut
        
        // Mettre à jour le framebuffer pour pointer vers la nouvelle texture d'écriture
        gl.bindFramebuffer(gl.FRAMEBUFFER, buffer.framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, buffer.textureWrite, 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

// Créer les géométries pour le rendu plein écran
function createQuad() {
    const positions = new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
         1,  1
    ]);
    
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    return buffer;
}

// Rendu principal
let frameCount = 0;
let startTime = Date.now();
let isRendering = false;

function startRender() {
    if (isRendering) return;
    
    isRendering = true;
    frameCount = 0;
    startTime = Date.now();
    render();
}

function render() {
    if (!shaderPrograms.image) {
        console.log('Pas de shader program, arrêt du rendu');
        isRendering = false;
        return;
    }
    
    if (canvas.width === 0 || canvas.height === 0) {
        console.log('Canvas de taille 0, arrêt du rendu');
        requestAnimationFrame(render);
        return;
    }
    
    // Si en pause, ne pas mettre à jour le frameCount ni le temps
    if (!isPaused) {
        frameCount++;
    }
    
    // Créer le quad si nécessaire
    if (!buffers.quad) {
        buffers.quad = createQuad();
        console.log('Quad créé');
    }
    
    // Pipeline simplifié : générer directement le dégradé
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    
    // Effacer avec une couleur de test (rouge) pour voir si le clear fonctionne
    gl.clearColor(0.2, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    
    // Log tous les 60 frames pour ne pas surcharger la console
    if (frameCount % 60 === 0) {
        console.log('Rendu frame', frameCount, 'canvas:', canvas.width, 'x', canvas.height);
    }
    
    // Rendre le shader principal
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    renderPass(shaderPrograms.image, null, [
        null, null, null, null
    ]);
    
    // Appliquer la color ramp en post-processing (optimisé)
    applyGradientRamp();
    
    requestAnimationFrame(render);
}

// Appliquer la color ramp en post-processing (optimisé)
function applyGradientRamp() {
    const colors = shaderParams.gradientColors;
    
    // Si pas de gradient, copier directement
    if (colors.length === 0) {
        displayCtx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
        displayCtx.drawImage(canvas, 0, 0);
        return;
    }
    
    // Pré-calculer le gradient pour éviter les calculs répétés
    const gradientWidth = 256; // Texture de gradient 1D
    const gradientData = new Uint8ClampedArray(gradientWidth * 4);
    
    for (let i = 0; i < gradientWidth; i++) {
        const t = i / (gradientWidth - 1);
        const colorIndex = t * (colors.length - 1);
        const index0 = Math.floor(colorIndex);
        const index1 = Math.min(index0 + 1, colors.length - 1);
        const localT = colorIndex - index0;
        
        const color0 = colors[index0];
        const color1 = colors[index1];
        
        gradientData[i * 4] = Math.round((color0[0] * (1 - localT) + color1[0] * localT) * 255);
        gradientData[i * 4 + 1] = Math.round((color0[1] * (1 - localT) + color1[1] * localT) * 255);
        gradientData[i * 4 + 2] = Math.round((color0[2] * (1 - localT) + color1[2] * localT) * 255);
        gradientData[i * 4 + 3] = 255;
    }
    
    // Lire les pixels du canvas WebGL une seule fois
    const imageData = new ImageData(canvas.width, canvas.height);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, imageData.data);
    
    // Traiter les pixels avec lookup table pour le gradient
    const pixels = imageData.data;
    const pixelCount = pixels.length / 4;
    
    // Coefficients de luminance pré-calculés
    const lumaR = 0.299;
    const lumaG = 0.587;
    const lumaB = 0.114;
    
    // Inverser et appliquer le gradient en une seule passe
    // Optimisation: traiter directement dans l'ordre de lecture pour éviter les calculs de coordonnées
    const width = canvas.width;
    const height = canvas.height;
    const flippedData = new Uint8ClampedArray(pixels.length);
    
    for (let y = 0; y < height; y++) {
        const srcY = height - 1 - y; // Inverser Y
        const srcRowStart = srcY * width * 4;
        const dstRowStart = y * width * 4;
        
        for (let x = 0; x < width; x++) {
            const srcIndex = srcRowStart + x * 4;
            const dstIndex = dstRowStart + x * 4;
            
            // Lire depuis la source
            const r = pixels[srcIndex] / 255.0;
            const g = pixels[srcIndex + 1] / 255.0;
            const b = pixels[srcIndex + 2] / 255.0;
            
            // Calculer la luminance
            const luminance = r * lumaR + g * lumaG + b * lumaB;
            
            // Lookup dans la texture de gradient pré-calculée
            const gradientIndex = Math.min(Math.floor(luminance * (gradientWidth - 1)), gradientWidth - 1);
            const gradientOffset = gradientIndex * 4;
            
            // Appliquer la couleur du gradient
            flippedData[dstIndex] = gradientData[gradientOffset];
            flippedData[dstIndex + 1] = gradientData[gradientOffset + 1];
            flippedData[dstIndex + 2] = gradientData[gradientOffset + 2];
            flippedData[dstIndex + 3] = pixels[srcIndex + 3]; // Garder l'alpha
        }
    }
    
    // Utiliser les données inversées
    imageData.data.set(flippedData);
    
    // Dessiner sur le canvas d'affichage
    displayCtx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
    displayCtx.putImageData(imageData, 0, 0);
}

function renderPass(program, targetFramebuffer, textures, writeTexture = null) {
    if (!program) return;
    
    gl.useProgram(program);
    
    // Bind framebuffer
    if (targetFramebuffer) {
        // Si on a une texture d'écriture spécifique, mettre à jour le framebuffer
        if (writeTexture) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, targetFramebuffer.framebuffer);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, writeTexture, 0);
        } else {
            gl.bindFramebuffer(gl.FRAMEBUFFER, targetFramebuffer.framebuffer);
        }
        const bufferSize = shaderParams.resolution;
        gl.viewport(0, 0, bufferSize, bufferSize);
    }
    
    // Bind textures
    const textureUnits = [gl.TEXTURE0, gl.TEXTURE1, gl.TEXTURE2, gl.TEXTURE3];
    textures.forEach((tex, i) => {
        if (tex) {
            gl.activeTexture(textureUnits[i]);
            gl.bindTexture(gl.TEXTURE_2D, tex);
            const location = gl.getUniformLocation(program, `iChannel${i}`);
            if (location !== null) gl.uniform1i(location, i);
        }
    });
    
    // Set uniforms
    const resolution = targetFramebuffer ? [canvas.width, canvas.height] : [canvas.width, canvas.height];
    // Réactiver le temps pour l'animation du shader (geler si en pause)
    const time = isPaused ? (pauseStartTime - startTime) / 1000.0 : (Date.now() - startTime) / 1000.0;
    
    const resLoc = gl.getUniformLocation(program, 'iResolution');
    if (resLoc !== null) gl.uniform2f(resLoc, resolution[0], resolution[1]);
    
    const timeLoc = gl.getUniformLocation(program, 'iTime');
    if (timeLoc !== null) gl.uniform1f(timeLoc, time);
    
    const frameLoc = gl.getUniformLocation(program, 'iFrame');
    if (frameLoc !== null) gl.uniform1i(frameLoc, frameCount);
    
    const mouseLoc = gl.getUniformLocation(program, 'iMouse');
    if (mouseLoc !== null) gl.uniform4f(mouseLoc, 0, 0, 0, 0);
    
    // Passer les paramètres du shader via les uniforms
    const scaleLoc = gl.getUniformLocation(program, 'uScale');
    if (scaleLoc !== null) {
        gl.uniform1f(scaleLoc, shaderParams.scale);
    } else if (frameCount === 1) {
        console.warn('uScale uniform non trouvé - CRITIQUE !');
    }
    
    const phaseXLoc = gl.getUniformLocation(program, 'uPhaseX');
    if (phaseXLoc !== null) {
        gl.uniform1f(phaseXLoc, shaderParams.phaseX);
    } else if (frameCount === 1) {
        console.warn('uPhaseX uniform non trouvé');
    }
    
    const velocityLoc = gl.getUniformLocation(program, 'uVelocity');
    if (velocityLoc !== null) {
        gl.uniform1f(velocityLoc, shaderParams.velocity);
    } else if (frameCount === 1) {
        console.warn('uVelocity uniform non trouvé');
    }
    
    const mode1DetailLoc = gl.getUniformLocation(program, 'uMode1Detail');
    if (mode1DetailLoc !== null) {
        gl.uniform1f(mode1DetailLoc, shaderParams.mode1Detail);
    } else if (frameCount === 1) {
        console.warn('uMode1Detail uniform non trouvé');
    }
    
    const mode1TwistLoc = gl.getUniformLocation(program, 'uMode1Twist');
    if (mode1TwistLoc !== null) {
        gl.uniform1f(mode1TwistLoc, shaderParams.mode1Twist);
    } else if (frameCount === 1) {
        console.warn('uMode1Twist uniform non trouvé');
    }
    
    const mode2SpeedLoc = gl.getUniformLocation(program, 'uMode2Speed');
    if (mode2SpeedLoc !== null) {
        gl.uniform1f(mode2SpeedLoc, shaderParams.mode2Speed);
    } else if (frameCount === 1) {
        console.warn('uMode2Speed uniform non trouvé');
    }
    
    const brightnessLoc = gl.getUniformLocation(program, 'uBrightness');
    if (brightnessLoc !== null) {
        gl.uniform1f(brightnessLoc, shaderParams.brightness);
    } else if (frameCount === 1) {
        console.warn('uBrightness uniform non trouvé');
    }
    
    const hueLoc = gl.getUniformLocation(program, 'uHue');
    if (hueLoc !== null) {
        gl.uniform1f(hueLoc, shaderParams.hue);
    } else if (frameCount === 1) {
        console.warn('uHue uniform non trouvé');
    }
    
    const saturationLoc = gl.getUniformLocation(program, 'uSaturation');
    if (saturationLoc !== null) {
        gl.uniform1f(saturationLoc, shaderParams.saturation);
    } else if (frameCount === 1) {
        console.warn('uSaturation uniform non trouvé');
    }
    
    const vibranceLoc = gl.getUniformLocation(program, 'uVibrance');
    if (vibranceLoc !== null) {
        gl.uniform1f(vibranceLoc, shaderParams.vibrance);
    } else if (frameCount === 1) {
        console.warn('uVibrance uniform non trouvé');
    }
    
    const contrastLoc = gl.getUniformLocation(program, 'uContrast');
    if (contrastLoc !== null) {
        gl.uniform1f(contrastLoc, shaderParams.contrast);
    } else if (frameCount === 1) {
        console.warn('uContrast uniform non trouvé');
    }
    
    const rgbMultiplierRLoc = gl.getUniformLocation(program, 'uRgbMultiplierR');
    if (rgbMultiplierRLoc !== null) {
        gl.uniform1f(rgbMultiplierRLoc, shaderParams.rgbMultiplierR);
    } else if (frameCount === 1) {
        console.warn('uRgbMultiplierR uniform non trouvé');
    }
    
    const rgbMultiplierGLoc = gl.getUniformLocation(program, 'uRgbMultiplierG');
    if (rgbMultiplierGLoc !== null) {
        gl.uniform1f(rgbMultiplierGLoc, shaderParams.rgbMultiplierG);
    } else if (frameCount === 1) {
        console.warn('uRgbMultiplierG uniform non trouvé');
    }
    
    const rgbMultiplierBLoc = gl.getUniformLocation(program, 'uRgbMultiplierB');
    if (rgbMultiplierBLoc !== null) {
        gl.uniform1f(rgbMultiplierBLoc, shaderParams.rgbMultiplierB);
    } else if (frameCount === 1) {
        console.warn('uRgbMultiplierB uniform non trouvé');
    }
    
    const colorOffsetLoc = gl.getUniformLocation(program, 'uColorOffset');
    if (colorOffsetLoc !== null) {
        gl.uniform1f(colorOffsetLoc, shaderParams.colorOffset);
    } else if (frameCount === 1) {
        console.warn('uColorOffset uniform non trouvé');
    }
    
    const grainAmountLoc = gl.getUniformLocation(program, 'uGrainAmount');
    if (grainAmountLoc !== null) {
        gl.uniform1f(grainAmountLoc, shaderParams.grainAmount);
    } else if (frameCount === 1) {
        console.warn('uGrainAmount uniform non trouvé');
    }
    
    const grainSizeLoc = gl.getUniformLocation(program, 'uGrainSize');
    if (grainSizeLoc !== null) {
        gl.uniform1f(grainSizeLoc, shaderParams.grainSize);
    } else if (frameCount === 1) {
        console.warn('uGrainSize uniform non trouvé');
    }
    
    const posterizeLoc = gl.getUniformLocation(program, 'uPosterize');
    if (posterizeLoc !== null) {
        gl.uniform1f(posterizeLoc, shaderParams.posterize);
    } else if (frameCount === 1) {
        console.warn('uPosterize uniform non trouvé');
    }
    
    const scanlinesLoc = gl.getUniformLocation(program, 'uScanlines');
    if (scanlinesLoc !== null) {
        gl.uniform1f(scanlinesLoc, shaderParams.scanlines);
    } else if (frameCount === 1) {
        console.warn('uScanlines uniform non trouvé');
    }
    
    const scanlineWidthLoc = gl.getUniformLocation(program, 'uScanlineWidth');
    if (scanlineWidthLoc !== null) {
        gl.uniform1f(scanlineWidthLoc, shaderParams.scanlineWidth);
    } else if (frameCount === 1) {
        console.warn('uScanlineWidth uniform non trouvé');
    }
    
    const movementModeLoc = gl.getUniformLocation(program, 'uMovementMode');
    if (movementModeLoc !== null) {
        gl.uniform1i(movementModeLoc, shaderParams.movementMode);
    } else if (frameCount === 1) {
        console.warn('uMovementMode uniform non trouvé');
    }
    
    // Gradient colors - plus besoin car on applique en post-processing
    
    // Channel resolutions
    for (let i = 0; i < 4; i++) {
        const loc = gl.getUniformLocation(program, `iChannelResolution[${i}]`);
        if (loc !== null) {
            gl.uniform3f(loc, resolution[0], resolution[1], 1.0);
        }
    }
    
    // Bind quad
    if (!buffers.quad) {
        console.error('Quad buffer non créé !');
        return;
    }
    
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.quad);
    const positionLoc = gl.getAttribLocation(program, 'aPosition');
    if (positionLoc === -1) {
        console.error('Attribut aPosition non trouvé dans le shader !');
        return;
    }
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
    
    // Vérifier les erreurs WebGL avant de dessiner
    let error = gl.getError();
    if (error !== gl.NO_ERROR) {
        console.error('Erreur WebGL avant drawArrays:', error);
    }
    
    // Vérifier que le programme est actif
    const currentProgram = gl.getParameter(gl.CURRENT_PROGRAM);
    if (currentProgram !== program) {
        console.error('Programme shader non actif ! Actuel:', currentProgram, 'Attendu:', program);
    }
    
    // Vérifier que le buffer est bien lié
    const currentBuffer = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
    if (currentBuffer !== buffers.quad) {
        console.error('Buffer quad non lié !');
    }
    
    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    
    // Vérifier les erreurs WebGL après le dessin
    error = gl.getError();
    if (error !== gl.NO_ERROR) {
        console.error('Erreur WebGL après drawArrays:', error);
        if (error === gl.INVALID_OPERATION) {
            console.error('INVALID_OPERATION - Le shader ou le programme est peut-être invalide');
        }
    } else if (frameCount % 60 === 0) {
        console.log('DrawArrays réussi, pas d\'erreur WebGL');
    }
}

// Démarrer l'application
init();
