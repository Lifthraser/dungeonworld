import { DwUtility } from '../utility.js';

/**
 * Extends the basic Actor class for Dungeon World.
 * @extends {Actor}
 */
export class ActorDw extends Actor {

  /**
   * Augment the basic actor data with additional dynamic data.
   */
  prepareData() {
    super.prepareData();

    const actorData = this;
    const data = actorData.system;
    const flags = actorData.flags;

    if (actorData.type === 'character') this._prepareCharacterData(actorData);
  }

  /**
   * Prepare Character type specific data
   */
  _prepareCharacterData(actorData) {
    const data = actorData.system;

    let debilities = {
      "str": game.settings.get('dungeonworld', 'debilityLabelSTR'),
      "dex": game.settings.get('dungeonworld', 'debilityLabelDEX'),
      "con": game.settings.get('dungeonworld', 'debilityLabelCON'),
      "int": game.settings.get('dungeonworld', 'debilityLabelINT'),
      "wis": game.settings.get('dungeonworld', 'debilityLabelWIS'),
      "cha": game.settings.get('dungeonworld', 'debilityLabelCHA')
    }

    debilities = Object.entries(debilities).reduce((obj, e) => {
      obj[e[0]] = game.i18n.localize(e[1]);
      return obj;
    }, {});

    const noAbilityScores = game.settings.get('dungeonworld', 'noAbilityScores');

    // Ability Scores
    for (let [a, abl] of Object.entries(data.abilities)) {
      // TODO: This is a possible formula, but would require limits on the
      // upper and lower ends.
      // abl.mod = Math.floor(abl.value * 0.4 - (abl.value < 11 ? 3.4 : 4.2));

      // @todo: This could be improved by storing old scores in a flag.
      // Convert ability scores if the no mod setting changed.
      if (noAbilityScores) {
        if (!Number.isNaN(abl.value) && abl.value > 3) {
          abl.value = DwUtility.getAbilityMod(abl.value, true);
        }
      }
      else {
        if (!Number.isNaN(abl.value) && abl.value < 4) {
          abl.value = DwUtility.getAbilityScore(abl.value, true);
        }
      }

      // Ability modifiers.
      abl.mod = DwUtility.getAbilityMod(abl.value);

      // Add labels.
      abl.label = CONFIG.DW.abilities[a];
      abl.debilityLabel = debilities[a];
      // Adjust mod based on debility.
      if (abl.debility && !game.settings.get("dungeonworld", "disDebility")) {
        abl.mod -= 1;
      }
    }

    // Calculate weight.
    let coin = data.attributes.coin.value ?? 0;
    let coinWeight = game.settings.get("dungeonworld", "coinWeight");
    let weight = coinWeight > 0 ? Math.floor(coin/coinWeight ) : 0;
    let items = actorData.items;
    if (items) {
      let equipment = items.filter(i => i.type == 'equipment');
      equipment.forEach(i => {
        // Add weight for each item.
        let itemQuantity = Number(i.system.quantity);
        let itemWeight = Number(i.system.weight);
        if (itemWeight > 0) {
          weight = weight + (itemQuantity * itemWeight);
        }
        // Add weapon tags.
        if (i.system?.equipped && i.system.itemType == 'weapon') {
          let tags = i.system.tags ? JSON.parse(i.system.tags) : [];
          for (let tag of tags) {
          // Match for piercing, armor, and damage tags.
            let piercing = tag.value.toLowerCase().match(/(\d+)\s*piercing|piercing\s*(\d+)/) ?? [];
            let ignoreArmor = tag.value.toLowerCase().includes('ignores armor');
            let dmgBonus = tag.value.toLowerCase().match(/[+](\d+)\s*damage|damage\s*[+](\d+)/) ?? [];

            // Add matching piercing tags if it's unset or if the value is higher.
            if (piercing[1] > 0 || piercing[2] > 0) {
              piercing = (piercing[1] ?? piercing[2]) ?? 0;
              if (!data.attributes.damage?.piercing || piercing > data.attributes.damage.piercing) {
                data.attributes.damage.piercing = piercing;
              }
            }

            // Add matching ignore armor tags if it's unset.
            if (!data.attributes.damage?.ignoreArmor) {
              data.attributes.damage.ignoreArmor = ignoreArmor;
            }

              // Add matching damage bonus tags if it's unset or if the value is higher.
              if (dmgBonus[1] > 0 || dmgBonus[2] > 0) { 
                dmgBonus = (dmgBonus[1] ?? dmgBonus[2]) ?? 0;
                if (!data.attributes.damage?.dmgBonus || dmgBonus > data.attributes.damage.dmgBonus) {
                  data.attributes.damage.dmgBonus = dmgBonus;
                }
              }
            }
        }
      });
    }
    // Update the value.
    data.attributes.weight.value = weight;

    // Add base flags.
    if (!actorData.flags.dungeonworld) actorData.flags.dungeonworld = {};
    if (!actorData.flags.dungeonworld.sheetDisplay) actorData.flags.dungeonworld.sheetDisplay = {};

    // Handle max XP.
    let rollData = this.getRollData();
    if (!rollData.attributes.level.value) rollData.attributes.level.value = 1;
    let xpRequiredFormula = game.settings.get('dungeonworld', 'xpFormula');
    let xpRequired = parseInt(xpRequiredFormula)
    if (isNaN(xpRequired)) {
      // Evaluate the max XP roll.
      let xpRequiredRoll = new Roll(xpRequiredFormula, this.getRollData());
      xpRequiredRoll.evaluateSync();
      xpRequired = xpRequiredRoll?.total ?? Number(data.attributes.level.value) + 7;
    }
    data.attributes.xp.max = xpRequired;

    // Handle roll mode flag.
    if (actorData?.flags?.dungeonworld) {
      if (!actorData.flags.dungeonworld.rollMode) actorData.flags.dungeonworld.rollMode = 'def';
    }
  }

  /** @override */
  getRollData() {
    const rollData = super.getRollData();

    for (let prop of ['attributes', 'abilities']) {
      if (!rollData?.[prop]) continue;
      for (let [k, v] of Object.entries(rollData[prop])) {
        v.val = v.value;
        rollData[k] = v;
      }
    }

    if (rollData?.attributes) rollData.attr = rollData.attributes;
    if (rollData?.abilities) rollData.abil = rollData.abilities;

    return rollData;
  }

  /**
   * Listen for click events on rollables.
   * @param {MouseEvent} event
   */
  async _onRoll(event, actor = null) {
    actor = !actor ? this.actor : actor;

    // Initialize variables.
    event.preventDefault();

    if (!actor.system) {
      return;
    }

    const a = event.currentTarget;
    const data = a.dataset;
    const actorData = actor.system;
    const itemId = $(a).parents('.item').attr('data-item-id');
    const item = actor.items.get(itemId);
    let formula = null;
    let titleText = null;
    let flavorText = null;
    let templateData = {};

    // Handle rolls coming directly from the ability score.
    if ($(a).hasClass('ability-rollable') && data.mod) {
      formula = `2d6+${data.mod}`;
      flavorText = data.label;
      if (data.debility) {
        flavorText += ` (${data.debility})`;
      }

      templateData = {
        title: flavorText
      };

      this.rollMove(formula, actor, data, templateData);
    }
    else if ($(a).hasClass('damage-rollable') && data.roll) {
      formula = data.roll;
      titleText = data.label;
      flavorText = data.flavor;
      templateData = {
        title: titleText,
        flavor: flavorText
      };

      this.rollMove(formula, actor, data, templateData, null, true);
    }
    else if (itemId != undefined) {
      item.roll();
    }
  }

  /**
   * Roll a move and use the chat card template.
   * @param {Object} templateData
   */
  rollMove(roll, actor, dataset, templateData, form = null, applyDamage = false) {
    let actorData = actor.system;
    // Render the roll.
    let template = 'systems/dungeonworld/templates/chat/chat-move.html';
    // GM rolls.
    let chatData = {
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: actor })
    };
    let rollMode = game.settings.get("core", "rollMode");
    if (["gmroll", "blindroll"].includes(rollMode)) chatData["whisper"] = ChatMessage.getWhisperRecipients("GM");
    if (rollMode === "selfroll") chatData["whisper"] = [game.user.id];
    if (rollMode === "blindroll") chatData["blind"] = true;
    // Handle dice rolls.
    if (roll) {
      // Roll can be either a formula like `2d6+3` or a raw stat like `str`.
      let formula = '';
      // Handle bond (user input).
      if (roll == 'BOND') {
        formula = form.bond.value ? `2d6+${form.bond.value}` : '2d6';
        if (dataset.mod && dataset.mod != 0) {
          formula += `+${dataset.mod}`;
        }
      }
      // Handle ability scores (no input).
      else if (roll.match(/(\d*)d\d+/g)) {
        formula = roll;
      }
      // Handle moves.
      else {
        formula = `2d6+${actorData.abilities[roll].mod}`;
        if (dataset.mod && dataset.mod != 0) {
          formula += `+${dataset.mod}`;
        }
      }
      if (formula != null) {
        // Do the roll.
        let roll = new Roll(`${formula}`, actor.getRollData());
        roll.roll();
        // Add success notification.
        if (formula.includes('2d6')) {
          if (roll.total < 7) {
            templateData.result = 'failure';
          }
          else if (roll.total > 6 && roll.total < 10) {
            templateData.result = 'partial';
          }
          else {
            templateData.result = 'success';
          }
        }
        // Render it.
        roll.render().then(r => {
          templateData.rollDw = r;
          renderTemplate(template, templateData).then(content => {
            chatData.content = content;
            if (game.dice3d) {
              game.dice3d.showForRoll(roll, game.user, true, chatData.whisper, chatData.blind).then(displayed => ChatMessage.create(chatData));
            }
            else {
              chatData.sound = CONFIG.sounds.dice;
              ChatMessage.create(chatData);
            }
          });
        });
      }
    }
    else {
      renderTemplate(template, templateData).then(content => {
        chatData.content = content;
        ChatMessage.create(chatData);
      });
    }
  }

  async applyDamage(amount, options = {op: 'full', ignoreArmor: false, piercing: 0, dmgBonus: 0}) {
    let newAmount = Number(amount);
    let dmgBonus = options?.dmgBonus;

    // Apply dmgbonus.
    if (options.op !== 'heal') {
        newAmount += parseInt(dmgBonus);
    }

    switch (options.op) {
      case 'half':
        newAmount = Math.floor(newAmount / 2);
        break;

      case 'double':
        newAmount = newAmount * 2;
        break;

      default:
        break;
    }

    let hp = this.system?.attributes?.hp?.value ?? 0;
    let hpMax = this.system?.attributes?.hp?.max ?? 1;
    let armor = this.system?.attributes?.ac?.value ?? 0;
    let piercing = options?.ignoreArmor ? armor : options?.piercing;
    let reduced = armor;

    if (!hp && !amount) return;

    // Reduce armor if needed.
    if (options.piercing && options.piercing > 0) reduced = Math.max(armor - options.piercing, 0);
    if (options.ignoreArmor) reduced = 0;
    if (isNaN(piercing)) piercing = 0;

    // Reduce damage by armor.
    if (options.op !== 'heal' && !options.ignoreArmor) {
      newAmount = Math.max(newAmount - reduced, 0);
    }

    // Adjust hp.
    let newHp = options.op === 'heal' ? hp + newAmount : hp - newAmount;
    if (newHp > hpMax) newHp = hpMax;

    if (newHp !== hp) {
      const update = {'system.attributes.hp.value': newHp};
      // Set options.dw so that we can update scrolling text in
      // preUpdate and onUpdate.
      const context = {
        dw: {
          armor: {
            reduced: reduced,
            value: armor,
            piercing: piercing,
          },
        },
      };
      return this.update(update, context);
    }
  }

  /**
   * Scrolling text helper method.
   *
   * @param {number} delta Difference to display.
   * @param {number} max Maximum value to calculate against.
   * @param {string} suffix Text to display
   * @param {object} overrideOptions Override options to pass to the token method.
   */
  showScrollingText(delta, max, suffix="", overrideOptions={}) {
    // Show scrolling text of hp update
    const tokens = this.isToken ? [this.token?.object] : this.getActiveTokens(true);
    if (tokens.length > 0) {
      if (!delta) delta = 0;

      let color = 0x999999;
      if (delta < 0) {
        color = 0xcc0000;
      }
      else if (delta > 0) {
        color = 0x00cc00;
      }

      for ( let token of tokens ) {
        const pct = delta !== 0 ? Math.clamp(Math.abs(delta) / max, 0, 1) : 0.25;
        let content = delta !== 0 ? delta.signedString() + " " + suffix : suffix;
        let textOptions = {
          anchor: CONST.TEXT_ANCHOR_POINTS.CENTER,
          direction: CONST.TEXT_ANCHOR_POINTS.TOP,
          fontSize: 16 + (32 * pct), // Range between [16, 48]
          fill: color,
          stroke: 0x000000,
          strokeThickness: 4,
          // jitter: 1,
          duration: 3000
        };
        canvas.interface.createScrollingText(token.center, content, foundry.utils.mergeObject(textOptions, overrideOptions));
      }
    }
  }

  /** @override */
  async _preUpdate(data, options, userId) {
    await super._preUpdate(data, options, userId);
    options.dw = options?.dw ?? {};

    if (!options.dw?.preUpdate) {
      options.dw.preUpdate = {system: foundry.utils.duplicate(this.system)};
    }
  }

  /** @override */
  async _onUpdate(updateData, options, userId) {
    await super._onUpdate(updateData, options, userId);
    const context = options?.dw?.preUpdate ?? false;

    if (!options.diff || !context || updateData.system === undefined) return; // Nothing to do.

    // Exit early if not owner.
    let displayText = this.isOwner;
    if (this.permission.default > 1) displayText = true;
    if (this.permission[game.userId] !== undefined && this.permission[game.userId] > 1) displayText = true;

    if (!displayText) return;

    // Prepare the scrolling text update.
    if (updateData.system?.attributes?.hp?.value !== undefined) {
      let hp = {
        original: context.system.attributes.hp.value ?? null,
        current: updateData.system.attributes.hp.value ?? null,
        max: context.system.attributes.hp?.max ?? updateData.system.attributes.hp.max
      }

      if (!isNaN(hp.original) && !isNaN(hp.current)) {
        hp.delta = hp.current - hp.original;

        if (hp.delta !== 0) {
          this.showScrollingText(hp.delta, hp.max, game.i18n.localize('DW.HP'), {anchor: CONST.TEXT_ANCHOR_POINTS.TOP});
        }

        if (hp.delta < 0 && options?.dw?.armor?.reduced) {
          let armorContext = {
            reduced: options.dw.armor.reduced,
            piercing: options.dw.armor?.piercing ?? 0
          };

          let textToShow = game.i18n.format('DW.Scrolling.armorReduced', armorContext);
          if (armorContext.piercing > 0) {
            textToShow = textToShow + '\r\n' + game.i18n.format('DW.Scrolling.armorPiercing', armorContext);
          }
          this.showScrollingText(null, null, textToShow, {anchor: CONST.TEXT_ANCHOR_POINTS.CENTER});
        }
      }
    }
  }
}
