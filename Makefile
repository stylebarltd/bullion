UUID := bullion@stylebarltd.github.io
EXT_DIR := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: schemas pack install dev uninstall clean

schemas:
	glib-compile-schemas schemas

## Build dist/$(UUID).shell-extension.zip (what extensions.gnome.org and releases use)
pack:
	mkdir -p dist
	gnome-extensions pack --force --out-dir=dist \
		--extra-source=currencies.js \
		--extra-source=icons \
		--extra-source=LICENSE .

## Install the packed zip into your user extensions
install: pack
	gnome-extensions install --force dist/$(UUID).shell-extension.zip

## Symlink this checkout for development (log out/in once, then edit freely)
dev: schemas
	ln -sfn $(CURDIR) $(EXT_DIR)

uninstall:
	rm -rf $(EXT_DIR)

clean:
	rm -rf dist schemas/gschemas.compiled
