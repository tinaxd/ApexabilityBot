FROM node:lts

WORKDIR /home/node/app
COPY . /home/node/app

RUN rm -rf node_modules
RUN npm install

CMD npm run start
