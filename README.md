# Asciidoctor-serve

This is a simple Node.js server which uses [asciidoctor][asciidoctor] to provide a live rendered view of
[AsciiDoc][asciidoc] files either in your web browser, or in a PDF viewer.

The web server monitors the directory containing the asciidoc file.
If any of the files there change, the file is re-rendered and broadcast to all connected devices.

The rendering is done through asciidoctor's command line program as it allows for better user control.

# Install/Upgrade/Remove

## Installing

1. Ensure you have the following programs installed:
    - [Git][git]
        
    - [Node.js 12 and NPM 6][node-npm] or newer
    
        Once you have a version of npm installed, I recommend using the [n package][n] to install updates.
    
    - [Asciidoctor][asciidoctor-install] (I recommend using ruby gem).
    
        I also have my own [installation guide][asciidoc-gist] which is less detailed, but covers adding
        bibliography and PDF support.
        
    - A PDF viewer (required only for serving to PDFs).
    The default is [Evince PDF][evince], but any should work as long as it has a command line interface.

1. Clone the repository
    
    ```shell script
    git clone https://github.com/sonrad10/asciidoctor-serve
    ````

1. Navigate to the project directory

    ```shell script
    cd asciidoctor-serve
    ```

1. Install the code

    ```shell script
    sudo npm install -g
    ```

## Upgrading

1. Navigate to the project directory

1. Pull from the repository

    ```shell script
    git pull
    ```

1. Install the updated version

    ```shell script
    sudo npm install -g
    ```

## Uninstalling

1. Delete the project directory

    ```shell script
    rm -rf asciidcotor-serve
    ```

1. Remove the script from your system

    ```shell script
    sudo npm remove -g asciidoctor-serve
    ```

# Running the program

1. Create an Asciidoc file (here is an [example file][asciidoc-example]).

1. Navigate to the directory holding the file you want to render.

1. Run the following, replacing `<FILE NAME>` with the actual name of the file:

    ```shell script
    asciidoctor-serve <FILE NAME>
    ```
    
    The command line interface supports all options provided by Asciidoctor (run `asciidoctor --help` for details).
    For example, if you wanted to render a bibliography with the [bibliography module][bibliography] you could use the following:
    
    ```shell script
    asciidoctor-serve -r asciidoctor-bibliography <FILE NAME> 
    ```

   If you want to serve to a PDF instead, add `-pdf` as the **first** argument.
   To use a PDF viewer other than evince, add `--viewer "<VIEWER COMMAND>"` after `-pdf`.
   For example:
   
   - `asciidoctor-serve -pdf -r asciidoctor-bibliography <FILE NAME>`
   - `asciidoctor-serve -pdf --viewer xreader -r asciidoctor-bibliography <FILE NAME>`
   - `asciidoctor-serve -pdf --viewer "xreader -f" -r asciidoctor-bibliography <FILE NAME>`
   
1. (HTML server only) Open your browser, and go to one of the URLs the program gives you (default is http://localhost:7000).

    You can also view the rendered version from any other device on your network with your IP instead of `localhost`
    (this is also given to you by the program).


# License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

# Credits

* This was heavily inspired by the `npm serve` script from by [Vue.js][vuejs] (a program I have been using a lot recently).
  No actual code was used from there, but you may notice some design similarities.


[asciidoc]:             https://asciidoc.org
[asciidoc-example]:     https://asciidoctor.org/docs/asciidoc-article/
[asciidoctor-gist]:     https://gist.github.com/sonrad10/5a7fd927da93aee7812493e5b39c34ca
[asciidoctor-install]:  https://asciidoctor.org/docs/user-manual/#install-using-gem
[asciidoctor]:          https://asciidoctor.org
[bibliography]:         https://github.com/riboseinc/asciidoctor-bibliography
[evince]:               https://help.gnome.org/users/evince/stable/index.html.en
[git]:                  https://git-scm.com/
[n]:                    https://www.npmjs.com/package/n
[node-npm]:             https://nodejs.org/en/
[vuejs]:                https://vuejs.org
