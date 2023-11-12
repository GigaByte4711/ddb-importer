import { parseTags } from "../../lib/DDBTemplateStrings.js";
import DDBHelper from "../../lib/DDBHelper.js";
import CompendiumHelper from "../../lib/CompendiumHelper.js";
import FileHelper from "../../lib/FileHelper.js";
import SETTINGS from "../../settings.js";
import utils from "../../lib/utils.js";
import logger from "../../logger.js";


export default class DDBRace {

  _generateDataStub() {
    this.data = {
      name: "",
      type: this.legacyMode ? "feat" : "race",
      system: utils.getTemplate(this.legacyMode ? "feat" : "race"),
      flags: {
        ddbimporter: {
          type: "race",
        },
        obsidian: {
          source: {
            type: "race"
          },
        },
      },
      img: null,
    };

    if (this.legacyMode) {
      setProperty(this.data, "system.type.value", "race");
    }

  }

  constructor(race, compendiumRacialTraits) {
    this.legacyMode = foundry.utils.isNewerVersion("2.4.0", game.system.version);
    this.race = race;
    this.compendiumRacialTraits = compendiumRacialTraits;
    this._generateDataStub();
    this.type = "humanoid";
    this._compendiumLabel = CompendiumHelper.getCompendiumLabel("traits");
  }

  buildBase() {
    this.data.name = (this.race.fullName) ? this.race.fullName.replace("’", "'") : this.race.name.replace("’", "'");
    this.data.system.description.value += `${this.race.description}\n\n`;

    this.data.flags.ddbimporter = {
      type: "race",
      entityRaceId: this.race.entityRaceId,
      version: CONFIG.DDBI.version,
      sourceId: this.race.sources.length > 0 ? [0].sourceId : -1, // is homebrew
      baseName: (this.race.fullName) ? this.race.fullName.replace("’", "'") : this.race.name.replace("’", "'")
    };

    if (this.race.moreDetailsUrl) {
      this.data.flags.ddbimporter['moreDetailsUrl'] = this.race.moreDetailsUrl;
    }

    this.data.system.source = DDBHelper.parseSource(this.race);

    if (this.race.isSubRace && this.race.baseRaceName) this.data.system.requirements = this.race.baseRaceName;
    const legacyName = game.settings.get("ddb-importer", "munching-policy-legacy-postfix");
    if (legacyName && this.race.isLegacy) {
      this.data.name += " (Legacy)";
    }
    return this.data;
  }

  async _generateRaceImage() {
    let avatarUrl;
    let largeAvatarUrl;
    let portraitAvatarUrl;

    const targetDirectory = game.settings.get(SETTINGS.MODULE_ID, "other-image-upload-directory").replace(/^\/|\/$/g, "");
    const useDeepPaths = game.settings.get(SETTINGS.MODULE_ID, "use-deep-file-paths");

    if (this.race.portraitAvatarUrl) {
      const imageNamePrefix = useDeepPaths ? "" : "race-portrait";
      const pathPostfix = useDeepPaths ? `/race/portrait` : "";
      const downloadOptions = { type: "race-portrait", name: this.race.fullName, targetDirectory, imageNamePrefix, pathPostfix };
      portraitAvatarUrl = await FileHelper.getImagePath(this.race.portraitAvatarUrl, downloadOptions);
      this.data.img = portraitAvatarUrl;
      this.data.flags.ddbimporter['portraitAvatarUrl'] = this.race.portraitAvatarUrl;
    }

    if (this.race.avatarUrl) {
      const imageNamePrefix = useDeepPaths ? "" : "race-avatar";
      const pathPostfix = useDeepPaths ? `/race/avatar` : "";
      const downloadOptions = { type: "race-avatar", name: this.race.fullName, targetDirectory, imageNamePrefix, pathPostfix };
      avatarUrl = await FileHelper.getImagePath(this.race.avatarUrl, downloadOptions);
      this.data.flags.ddbimporter['avatarUrl'] = this.race.avatarUrl;
      if (!this.data.img) {
        this.data.img = avatarUrl;
      }
    }

    if (this.race.largeAvatarUrl) {
      const imageNamePrefix = useDeepPaths ? "" : "race-large";
      const pathPostfix = useDeepPaths ? `/race/large` : "";
      const downloadOptions = { type: "race-large", name: this.race.fullName, targetDirectory, imageNamePrefix, pathPostfix };
      largeAvatarUrl = await FileHelper.getImagePath(this.race.largeAvatarUrl, downloadOptions);
      // eslint-disable-next-line require-atomic-updates
      this.data.flags.ddbimporter['largeAvatarUrl'] = this.race.largeAvatarUrl;
      if (!this.data.img) {
        this.data.img = largeAvatarUrl;
      }
    }

    const image = (avatarUrl) ? `<img src="${avatarUrl}">\n\n` : (largeAvatarUrl) ? `<img src="${largeAvatarUrl}">\n\n` : "";
    this.data.system.description.value += image;
    return image;
  }

  #typeCheck(feature) {
    if (feature.name.trim() === "Creature Type") {
      const typeRegex = /You are a (\S*)\./i;
      const typeMatch = feature.description.match(typeRegex);
      if (typeMatch) {
        logger.debug(`Explicit type detected: ${typeMatch[1]}`, typeMatch);
        this.type = typeMatch[1].toLowerCase();
      }
    }
  }

  #addFeatureDescription(feature) {
    const featureMatch = this.compendiumRacialTraits.find((match) =>
      hasProperty(match, "flags.ddbimporter.baseName") && hasProperty(match, "flags.ddbimporter.entityRaceId")
      && feature.name.replace("’", "'") === match.flags.ddbimporter.baseName
      && match.flags.ddbimporter.entityRaceId === feature.entityRaceId
    );
    const title = (featureMatch) ? `<p><b>@Compendium[${this._compendiumLabel}.${featureMatch._id}]{${feature.name}}</b></p>` : `<p><b>${feature.name}</b></p>`;
    this.data.system.description.value += `${title}\n${feature.description}\n\n`;
  }

  async buildRace() {
    this.buildBase();

    this.data.flags.ddbimporter.baseRaceId = this.race.baseRaceId;
    this.data.flags.ddbimporter.baseName = this.race.baseName;
    this.data.flags.ddbimporter.baseRaceName = this.race.baseRaceName;
    this.data.flags.ddbimporter.fullName = this.race.fullName;
    this.data.flags.ddbimporter.subRaceShortName = this.race.subRaceShortName;
    this.data.flags.ddbimporter.isHomebrew = this.race.isHomebrew;
    this.data.flags.ddbimporter.isLegacy = this.race.isLegacy;
    this.data.flags.ddbimporter.isSubRace = this.race.isSubRace;
    this.data.flags.ddbimporter.moreDetailsUrl = this.race.moreDetailsUrl;
    this.data.flags.ddbimporter.featIds = this.race.featIds;

    await this._generateRaceImage();

    this.race.racialTraits.forEach((f) => {
      const feature = f.definition;
      this.#addFeatureDescription(feature);
      this.#typeCheck(feature);
    });

    // set final type
    setProperty(this.data, "system.type.value", this.type);

    // finally a tag parse to update the description
    this.data.system.description.value = parseTags(this.data.system.description.value);

    logger.debug("Race generated", { DDBRace: this });
    return this.data;
  }

  static async getRacialTraitsLookup(racialTraits, fail = true) {
    const compendium = CompendiumHelper.getCompendiumType("traits", fail);
    if (compendium) {
      const flags = ["name", "flags.ddbimporter.entityRaceId", "flags.ddbimporter.baseName"];
      const index = await compendium.getIndex({ fields: flags });
      const traitIndex = await index.filter((i) => racialTraits.some((orig) => i.name === orig.name));
      return traitIndex;
    } else {
      return [];
    }
  }

}

