# kikoeru-translate-lrc
A tool that lets you translate various lyric files. Originally created for use with Kikoeru but adjusted to work with any folder structure.

## Usage
1) Download the latest release from [here](https://github.com/Makar8000/kikoeru-translate-lrc/releases/latest) and extract it.
   - The correct file is named `translate-lrc.zip`.
2) Open the `.env` file in notepad and adjust the settings as necessary.
   - See [Configuration](#configuration) for more details on the `.env` file
3) Save your changes and close the file
4) Place the files you want to translate in the `queue` folder (or whatever folder you set in the `.env` file)
5) Run `translate.exe`
6) Translated files will be placed in the `output` folder by default

## Configuration
To adjust the configuration, you will need to create a `.env` file in the same directory by creating a copy of the `.env.example` file.

### Common config
- `TRANSLATOR` - The translation method to use. The available options are:
  - `DEEPL` - For [DeepL](https://www.deepl.com/)
  - `LIBRE` - For [LibreTranslate](https://github.com/LibreTranslate/LibreTranslate)
  - `LUNA` - For [LunaTranslator](https://lunatranslator.org/)
- `RJ_PATH` - The location of the folder that contains all of your lyric/subtitle files that need to be translated. This path will be searched recursively. Defaults to `./queue` in the same directory if not provided.
- `BAK_PATH` - The location of the folder where you want a backup of your lyric/subtitle files to be stored. Defaults to `./backup` in the same directory if not provided.
- `OUT_PATH` - The location of the folder where you want your translated lyric/subtitle files to be stored. The folder structure of the files will be the same structure as the `RJ_PATH` folder. Defaults to `./output` in the same directory if not provided.

### DeepL-specific config
These configuration items only apply if your `TRANSLATOR` is set to `DEEPL`:
- `DEEPL_API_KEY` - **Required**. The DeepL API Key. Requires a DeepL account, but creating your own key is free. You can find more information [here](https://support.deepl.com/hc/en-us/articles/360020695820).
- `DEEPL_SOURCE_LANG` - The source language code you want to translate from. If it is unknown or you would prefer to have DeepL auto-detect it, you can delete this entirely. See [this article](https://developers.deepl.com/docs/resources/supported-languages#source-languages) for a list of supported language codes.
- `DEEPL_TARGET_LANG` - The target language code you want to translate to. Defaults to `en-US` if not provided. See [this article](https://developers.deepl.com/docs/resources/supported-languages#target-languages) for a list of supported language codes.

### LibreTranslate-specific config
These configuration items only apply if your `TRANSLATOR` is set to `LIBRE`:
- `LIBRE_ENDPOINT` - The endpoint which is hosting your LibreTranslate instance.
- `LIBRE_SOURCE_LANG` - The source language code you want to translate from. If it is unknown or you would prefer to have it auto-detected, you can delete this entirely. See [this page](https://libretranslate.com/languages) for a list of supported language codes.
- `LIBRE_TARGET_LANG` - The target language code you want to translate to. Defaults to `en` if not provided. See [this page](https://libretranslate.com/languages) for a list of supported language codes.

### LunaTranslator-specific config
These configuration items only apply if your `TRANSLATOR` is set to `LUNA`:
- `LUNA_ENDPOINT` - The endpoint which is hosting your LibreTranslate instance.
- `LUNA_TRANSLATOR` - The name of the translator to use within LunaTranslator. You must configure the translators yourself within LunaTranslator. You can visit the `/api/list/translator` endpoint of your server to get a list of translator names.

## Running from source
This project requires [deno](https://deno.com/) to run.

1) `deno install`
2) Copy `.env.example` to `.env`
3) Edit `.env` and adjust settings as necessary.
   - See [Configuration](#configuration) for more details on the `.env` file
4) Place your files/folders with untranslated subtitles in your `RJ_PATH` (queue) folder
5) `deno task translate`

### Tasks
- `deno task translate` - The main task. Translates lyrics/subtitles as specified in this README.
- `deno task deepl-tlfix` - Useful for re-translating or fixing a cache file that may have been translated incorrectly by DeepL. For example, if automatic language detection is enabled, but DeepL selected the wrong language. To use:
  1) Copy the bad `data/tlcache.json` to `data/tlfix.json`
  2) Strip the file so that only the entries you want to retranslate are there
  3) Replace `detectedSourceLang` with the correct language code
  4) Run the script. The translated file will be saved to `data/tlfix-translated.json`
