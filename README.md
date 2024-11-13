# kikoeru-translate-lrc
A tool that lets you translate various lyric files. Originally created for use with Kikoeru but adjusted to work with any folder structure.

## Usage
1) Download the latest release from [here](https://github.com/Makar8000/kikoeru-translate-lrc/releases/latest) and extract it.
   - The correct file is named `translate-lrc.zip`.
2) Open the `.env` file in notepad and adjust the settings as necessary. You will need to provide your own [DeepL API Key](https://support.deepl.com/hc/en-us/articles/360020695820)
   - See [Configuration](#configuration) for more details on the `.env` file
3) Save your changes and close the file
4) Place the files you want to translate in the `queue` folder (or whatever folder you set in the `.env` file)
5) Run `translate.exe`
6) Translated files will be placed in the `output` folder by default

## Configuration
To adjust the configuration, you will need to create a `.env` file in the same directory by creating a copy of the `.env.example` file.

- `DEEPL_API_KEY` - **Required**. The DeepL API Key. Requires a DeepL account, but creating your own key is free. You can find more information [here](https://support.deepl.com/hc/en-us/articles/360020695820).
- `SOURCE_LANG` - The source language code you want to translate from. If it is unknown or you would prefer to have DeepL auto-detect it, you can delete this entirely. See [this article](https://developers.deepl.com/docs/resources/supported-languages#source-languages) for a list of supported language codes.
- `TARGET_LANG` - The target language code you want to translate to. Defaults to `en-US` if not provided. See [this article](https://developers.deepl.com/docs/resources/supported-languages#target-languages) for a list of supported language codes.
- `RJ_PATH` - The location of the folder that contains all of your lyric/subtitle files that need to be translated. This path will be searched recursively. Defaults to `./queue` in the same directory if not provided.
- `BAK_PATH` - The location of the folder where you want a backup of your lyric/subtitle files to be stored. Defaults to `./backup` in the same directory if not provided.
- `OUT_PATH` - The location of the folder where you want your translated lyric/subtitle files to be stored. The folder structure of the files will be the same structure as the `RJ_PATH` folder. Defaults to `./output` in the same directory if not provided.

## Running from source
This project requires [deno](https://deno.com/) to run.

1) `deno install`
2) Copy `.env.example` to `.env`
3) Edit `.env` and adjust settings as necessary. You will need to provide your own [DeepL API Key](https://support.deepl.com/hc/en-us/articles/360020695820)
   - See [Configuration](#configuration) for more details on the `.env` file
4) Place your files/folders with untranslated subtitles in your `RJ_PATH` (queue) folder
5) `deno task translate`

### Tasks
- `deno task translate` - The main task. Translates lyrics/subtitles as specified in this README.
- `deno task translate-tlfix` - Useful for re-translating or fixing a cache file that may have been translated incorrectly. For example, if automatice language detection is enabled, but DeepL selected the wrong language. To use:
  1) Copy the bad `data/tlcache.json` to `data/tlfix.json`
  2) Strip the file so that only the entries you want to retranslate are there
  3) Replace `detectedSourceLang` with the correct language code
  4) Run the script. The translated file will be saved to `data/tlfix-translated.json`
