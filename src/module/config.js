export const DW = {};

DW.abilities = {
  "str": "DW.AbilityStr",
  "dex": "DW.AbilityDex",
  "con": "DW.AbilityCon",
  "int": "DW.AbilityInt",
  "wis": "DW.AbilityWis",
  "cha": "DW.AbilityCha"
};

DW.debilities = {
  "str": "DW.DebilityStr",
  "dex": "DW.DebilityDex",
  "con": "DW.DebilityCon",
  "int": "DW.DebilityInt",
  "wis": "DW.DebilityWis",
  "cha": "DW.DebilityCha"
};

DW.rollResults = {
  failure: {
    start: null,
    end: 6,
    label: 'DW.failure'
  },
  partial: {
    start: 7,
    end: 9,
    label: 'DW.partial'
  },
  success: {
    start: 10,
    end: null,
    label: 'DW.success'
  }
};

export class DwClassList {
  static async getClasses(labels_only = true) {
    // First, retrieve any custom or overridden classes so that we can
    // prioritize those.
    let classes = game.items.filter(item => item.type == 'class');
    
    const noCompendiumAutoData = game.settings.get('dungeonworld', 'noCompendiumAutoData');
    if (!noCompendiumAutoData) {
      const compendiumPrefix = game.settings.get('dungeonworld', 'compendiumPrefix');
      // Next, retrieve compendium classes and merge them in.
      for (let c of game.packs) {

        let isClassCompendium = c.metadata.name == 'classes'
        if (compendiumPrefix != '') {
          isClassCompendium = c.metadata.name.indexOf(`${compendiumPrefix.toLowerCase()}-classes`) >= 0
        }
        
        if (c.metadata.type && c.metadata.type == 'Item' && isClassCompendium) {
          let items = c ? await c.getDocuments() : [];
          classes = classes.concat(items);
        }
      }
    }
    // Reduce duplicates. Because item classes happen first, this will prevent
    // duplicate compendium entries from overriding the items.
    let charClassNames = [];
    for (let charClass of classes) {
      let charClassName = charClass.data.name;
      if (charClassNames.includes(charClassName) !== false) {
        classes = classes.filter(item => item.id != charClass.id);
      }
      else {
        charClassNames.push(charClassName);
      }
    }

    // Sort the charClassNames list.
    if (labels_only) {
      charClassNames.sort((a, b) => {
        const aSort = a.toLowerCase();
        const bSort = b.toLowerCase();
        if (aSort < bSort) {
          return -1;
        }
        if (aSort > bSort) {
          return 1;
        }
        return 0;
      });

      return charClassNames;
    }
    // Sort the class objects list.
    else {
      classes.sort((a, b) => {
        const aSort = a.data.name.toLowerCase();
        const bSort = b.data.name.toLowerCase();
        if (aSort < bSort) {
          return -1;
        }
        if (aSort > bSort) {
          return 1;
        }
        return 0;
      });

      return classes;
    }
  }
}
