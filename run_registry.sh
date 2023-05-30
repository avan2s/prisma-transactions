#! /bin/bash
docker run -d -it --rm --name verdaccio -p 4873:4873 verdaccio/verdaccio
rm -Rf dist
npm run build
# npm adduser --registry http://localhost:4873 --always-auth
npm publish --registry http://localhost:4873