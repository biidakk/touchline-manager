// Name generation. The fictional styles (used by older saves) assemble names
// from syllables; the real countries draw common first names and surnames.

const STYLES = {
  romance: {
    first: ['Marco', 'Luca', 'Andrea', 'Diego', 'Mateo', 'Pablo', 'Nico', 'Bruno', 'Enzo', 'Dario', 'Fabio', 'Rafael',
      'Tomas', 'Lorenzo', 'Iker', 'Sergio', 'Matias', 'Alvaro', 'Emilio', 'Gianni', 'Leandro', 'Hugo', 'Adrian', 'Ruben',
      'Simone', 'Davide', 'Iago', 'Cesar', 'Joaquin', 'Elio'],
    lastPre: ['Bel', 'Cor', 'Fal', 'Mar', 'Ros', 'Ven', 'Tor', 'Lan', 'Sar', 'Cal', 'Dor', 'Gal', 'Mor', 'Pel', 'Ser',
      'Val', 'Riv', 'Ben', 'Car', 'Fer', 'Bas', 'Cip', 'Ord', 'Mancu', 'Taver', 'Lom', 'Sant', 'Ved', 'Garr', 'Albi'],
    lastSuf: ['ini', 'etti', 'ano', 'ardo', 'esi', 'ucci', 'ales', 'ero', 'ola', 'ante', 'ari', 'elli', 'ondo', 'ez',
      'ino', 'oni', 'eda', 'illa', 'ozzi', 'ura'],
    townPre: ['Mont', 'Castel', 'Porto', 'Val', 'Bel', 'Ros', 'Ter', 'Alba', 'Corv', 'Lur', 'Sal', 'Fio', 'Ser', 'Cam',
      'Ver', 'Lav', 'Pal', 'Nar', 'Sorr', 'Bric', 'Ost', 'Mir', 'Quer', 'Arg', 'Dov', 'Esc', 'Gual', 'Ibar', 'Lucc',
      'Marb', 'Novar', 'Oliv', 'Pietr', 'Rocc', 'Sabin', 'Trev', 'Urb', 'Zamor', 'Cedr', 'Font'],
    townSuf: ['ena', 'ano', 'ora', 'ella', 'ino', 'ezza', 'ago', 'ara', 'ito', 'enza', 'osa', 'eto', 'ia', 'ona'],
    club: ['AC {t}', 'US {t}', 'Sporting {t}', 'Atletico {t}', 'CD {t}', 'Unione {t}', 'SC {t}', '{t} Calcio', 'Real {t}',
      'Deportivo {t}', 'Racing {t}', '{t} FC'],
    stadium: ['Stadio {s}', 'Arena {t}', 'Campo {t}', 'Estadio {s}', 'Stadio Comunale {t}'],
  },
  nordic: {
    first: ['Erik', 'Lars', 'Magnus', 'Anders', 'Henrik', 'Jonas', 'Sven', 'Mikkel', 'Oskar', 'Emil', 'Tobias', 'Kasper',
      'Rasmus', 'Leif', 'Nils', 'Johan', 'Viktor', 'Axel', 'Tor', 'Halvard', 'Sindre', 'Mats', 'Even', 'Fredrik',
      'Aksel', 'Birk', 'Ole', 'Trygve', 'Jesper', 'Ivar'],
    lastPre: ['Holm', 'Berg', 'Strand', 'Lind', 'Dahl', 'Fjel', 'Sand', 'Vik', 'Ask', 'Eng', 'Hag', 'Brek', 'Ny', 'Sol',
      'Skog', 'Ros', 'Tor', 'Ul', 'Kvi', 'Myr', 'Aa', 'Lunde', 'Hov', 'Rye', 'Bjor', 'Gran', 'Stav', 'Ek'],
    lastSuf: ['gren', 'sen', 'berg', 'stad', 'lund', 'vik', 'heim', 'dal', 'by', 'qvist', 'man', 'rud', 'strom', 'ness',
      'gaard', 'mo', 'lie', 'haug'],
    townPre: ['Kald', 'Fjor', 'Sten', 'Hvit', 'Grim', 'Ulf', 'Brann', 'Sjo', 'Mor', 'Tros', 'Lang', 'Eik', 'Hval',
      'Skjer', 'Ost', 'Vind', 'Rav', 'Isa', 'Norr', 'Elg', 'Bjark', 'Dyr', 'Frost', 'Gyl', 'Hallr', 'Kvarn', 'Lyng',
      'Mjol', 'Old', 'Ring', 'Saltr', 'Torv', 'Vest', 'Aur'],
    townSuf: ['vik', 'heim', 'stad', 'borg', 'fjord', 'by', 'havn', 'sund', 'dal', 'nes', 'holm', 'vang'],
    club: ['{t} IF', '{t} BK', 'IK {t}', '{t} FK', 'FC {t}', '{t} SK', 'IL {t}', '{t} Ballklubb', 'Kamp {t}'],
    stadium: ['{t} Stadion', '{t} Arena', '{s} Park', '{t}vallen', '{t} Idrettspark'],
  },
  slavic: {
    first: ['Jan', 'Petr', 'Tomas', 'Lukas', 'Marek', 'Ondrej', 'Pavel', 'Jakub', 'Milan', 'Martin', 'Filip', 'Adam',
      'Vaclav', 'David', 'Radek', 'Stanislav', 'Igor', 'Dusan', 'Boris', 'Vojtech', 'Michal', 'Roman', 'Karel', 'Matej',
      'Zdenek', 'Libor', 'Ales', 'Bohdan', 'Vit', 'Kamil'],
    lastPre: ['Kov', 'Nov', 'Dvor', 'Pol', 'Bran', 'Hor', 'Kral', 'Stru', 'Vrb', 'Mil', 'Zel', 'Rad', 'Sok', 'Lis', 'Bor',
      'Krem', 'Vys', 'Drob', 'Petr', 'Hrub', 'Jel', 'Kub', 'Smol', 'Tich', 'Vlk', 'Cern'],
    lastSuf: ['ak', 'ek', 'ic', 'ov', 'sky', 'ar', 'an', 'ec', 'ik', 'inek', 'ovic', 'ura', 'as', 'acek', 'ota', 'ny'],
    townPre: ['Krasn', 'Vel', 'Bel', 'Star', 'Zlat', 'Gor', 'Dub', 'Brod', 'Les', 'Kam', 'Jav', 'Mor', 'Ples', 'Tren',
      'Hrad', 'Sum', 'Vod', 'Lip', 'Ruz', 'Bystr', 'Cerv', 'Drav', 'Hlin', 'Jasen', 'Kral', 'Luc', 'Mlad', 'Nisk',
      'Okr', 'Pribr', 'Rokyc', 'Svet', 'Topol', 'Zbor'],
    townSuf: ['ov', 'ice', 'in', 'any', 'ava', 'ec', 'ograd', 'ovo', 'na', 'iny', 'nik', 'ary'],
    club: ['FK {t}', 'SK {t}', 'TJ {t}', 'Dynamo {t}', 'Union {t}', 'Sokol {t}', '{t} FC', 'Viktoria {t}', 'Slavoj {t}',
      'Lokomotiva {t}'],
    stadium: ['Stadion {t}', '{t} Arena', 'Stadion {s}', 'Mestsky stadion {t}', '{t} Park'],
  },
  west: {
    first: ['Kofi', 'Amadou', 'Moussa', 'Ibrahim', 'Seydou', 'Kwame', 'Yaw', 'Femi', 'Sekou', 'Mamadou', 'Issa', 'Abdou',
      'Kojo', 'Chidi', 'Tunde', 'Oumar', 'Lamine', 'Bakary'],
    lastPre: ['Ade', 'Ko', 'Mba', 'Oku', 'Tan', 'Dia', 'Sei', 'Ama', 'Ndo', 'Ye', 'Ba', 'Ka', 'Tou', 'Sa', 'Ogu'],
    lastSuf: ['mbe', 'ra', 'fo', 'nde', 'gou', 'yo', 'ssa', 'la', 'ko', 'bi', 'nte', 'wu'],
    townPre: ['Ama', 'Kor', 'Tamb'], townSuf: ['ba', 'ko'], club: ['{t} FC'], stadium: ['{t} Stadium'],
  },
  anglo: {
    first: ['James', 'Callum', 'Liam', 'Ryan', 'Jack', 'Owen', 'Harry', 'Connor', 'Ethan', 'Lewis', 'Daniel', 'Sam',
      'Josh', 'Reece', 'Kyle', 'Ben', 'Alfie', 'Rhys'],
    lastPre: ['Ash', 'Brad', 'Carl', 'Dun', 'Elm', 'Fair', 'Gold', 'Hart', 'Kings', 'Mar', 'North', 'Ridge', 'Thorn',
      'Wey', 'Black', 'Hol', 'Pen', 'Cran'],
    lastSuf: ['ton', 'ley', 'wood', 'field', 'worth', 'by', 'ford', 'well', 'more', 'ham', 'stone', 'wick'],
    townPre: ['Ash', 'Brad'], townSuf: ['ton', 'ley'], club: ['{t} FC'], stadium: ['{t} Park'],
  },
};

// Real countries: common first names and surnames, combined at random.
// Pairs that obviously match a well-known player were left out, but a random
// combination can still match a real person now and then.
Object.assign(STYLES, {
  english: {
    first: ['Harry', 'Jack', 'James', 'Oliver', 'George', 'Charlie', 'Thomas', 'William', 'Jacob', 'Joshua', 'Daniel',
      'Samuel', 'Joe', 'Ryan', 'Luke', 'Mason', 'Jordan', 'Marcus', 'Conor', 'Lewis', 'Jamie', 'Aaron', 'Reece',
      'Ollie', 'Kieran', 'Tyler', 'Dominic', 'Alfie', 'Freddie', 'Elliot', 'Rhys', 'Max', 'Nathan', 'Adam', 'Toby',
      'Owen', 'Archie', 'Liam', 'Ethan', 'Isaac', 'Leon', 'Dylan', 'Josh', 'Kai', 'Theo', 'Rio', 'Jayden', 'Callum'],
    last: ['Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Johnson', 'Robinson', 'Wright', 'Thompson', 'Evans',
      'Roberts', 'Green', 'Hall', 'Wood', 'Jackson', 'Clarke', 'Hughes', 'Turner', 'Hill', 'Cooper', 'Ward', 'Morris',
      'Moore', 'Watson', 'Baker', 'Allen', 'Young', 'Mitchell', 'Bennett', 'Carter', 'Ellis', 'Fletcher', 'Holmes',
      'Lloyd', 'Marshall', 'Webb', 'Griffiths', 'Hunt', 'Mills', 'Payne', 'Dixon', 'Fox', 'Grant', 'Saunders',
      'Pearson', 'Chapman', 'Howard', 'Gibson', 'Reid', 'Matthews', 'Owens', 'Bailey', 'Knight', 'Butler', 'Simpson',
      'Stevens', 'Harvey', 'Barker', 'Dawson', 'Fisher', 'Hudson', 'Nicholls', 'Osei', 'Mensah', 'Okafor', 'Adeyemi',
      'Campbell', 'Murray', 'Burke', 'Doyle', 'Quinn', 'Sterling-Hart', 'Ashworth', 'Pickering', 'Hartley'],
  },
  spanish: {
    first: ['Alejandro', 'Pablo', 'Sergio', 'Javier', 'Daniel', 'Adrián', 'Álvaro', 'Diego', 'Mario', 'Hugo', 'Iván',
      'Marcos', 'Rubén', 'Jorge', 'Carlos', 'Miguel', 'Óscar', 'Unai', 'Aitor', 'Jon', 'Mikel', 'Borja', 'Nacho', 'Dani',
      'Víctor', 'Rodrigo', 'Gonzalo', 'Andrés', 'Manu', 'Alberto', 'Iker', 'Ángel', 'Asier', 'Samuel', 
      'Joel', 'Marc', 'Pol', 'Gerard', 'Arnau', 'Nico', 'Lucas', 'Fermín', ],
    last: ['García', 'Martínez', 'Sánchez', 'Pérez', 'Gómez', 'Jiménez', 'Ruiz', 'Díaz', 'Muñoz',
      'Álvarez', 'Romero', 'Navarro', 'Domínguez', 'Vázquez', 'Gil', 'Ramírez', 'Blanco',
      'Morales', 'Ortega', 'Delgado', 'Castro', 'Ortiz', 'Rubio', 'Marín', 'Sanz', 'Medina', 'Garrido',
      'Cortés', 'Castillo', 'Santos', 'Guerrero', 'Cano', 'Prieto', 'Méndez', 'Cruz', 'Calvo', 'Gallego',
      'Vidal', 'León', 'Márquez', 'Herrera', 'Peña', 'Flores', 'Cabrera', 'Campos', 'Vega', 'Fuentes', 'Díez',
      'Caballero', 'Aguilar', 'Pascual', 'Santana', 'Herrero', 'Montero', 'Hidalgo', 'Ibáñez', 'Echeverría', 'Etxeberria',
      'Arrieta', 'Zubiri', 'Puig', 'Ferrer', 'Vila', 'Pons'],
  },
  italian: {
    first: ['Alessandro', 'Andrea', 'Lorenzo', 'Matteo', 'Francesco', 'Gabriele', 'Riccardo', 'Davide', 'Federico',
      'Simone', 'Luca', 'Marco', 'Giacomo', 'Nicolò', 'Stefano', 'Tommaso', 'Michele', 'Giorgio', 'Filippo', 'Emanuele',
      'Daniele', 'Pietro', 'Antonio', 'Giovanni', 'Salvatore', 'Leonardo', 'Mattia', 'Edoardo', 'Manuel', 'Samuele',
      'Alberto', 'Cristian', 'Gianmarco', 'Valerio', 'Raffaele', 'Vincenzo', 'Diego', 'Elia', 'Christian', 'Fabio'],
    last: ['Rossi', 'Russo', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Marino', 'Greco', 'Bruno',
      'Gallo', 'De Luca', 'Costa', 'Giordano', 'Rizzo', 'Lombardi', 'Moretti', 'Barbieri', 'Fontana', 'Santoro',
      'Mariani', 'Rinaldi', 'Ferrara', 'Galli', 'Martini', 'Leone', 'Longo', 'Gentile', 'Martinelli', 'Vitale',
      'Lombardo', 'Serra', 'De Santis', "D'Angelo", 'Marchetti', 'Parisi', 'Ferraro', 'Fabbri', 
      'Marini', 'Grasso', 'Valentini', 'Messina', 'Sala', 'De Angelis', 'Palumbo', 'Sanna', 'Farina', 'Rizzi',
      'Monti', 'Cattaneo', 'Morelli', 'Amato', 'Silvestri', 'Mazza', 'Testa', 'Pellegrino', 'Carbone', 'Giuliani',
      'Benedetti', 'Barone', 'Rossetti', 'Montanari', 'Guerra', 'Palmieri', 'Bernardi', 'Fiore', 'De Rosa', 'Ferri'],
  },
  german: {
    first: ['Lukas', 'Leon', 'Jonas', 'Felix', 'Maximilian', 'Paul', 'Niklas', 'Tim', 'Jan', 'Julian', 'Moritz',
      'Tobias', 'Florian', 'Kevin', 'Marco', 'Dennis', 'Benjamin', 'Sebastian', 'Christian', 'Philipp', 'Fabian', 'Kai',
      'Robin', 'Nico', 'Lennart', 'Jannik', 'Marvin', 'Sven', 'Dominik', 'Stefan', 'Patrick', 'Erik', 'Malte',
      'Jonathan', 'Mats', 'Luca', 'Finn', 'Noah', 'Ben', 'Elias', 'Tom', 'Joshua', 'Yannick', 'Arne', 'Hendrik'],
    last: ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Hoffmann', 'Schäfer',
      'Bauer', 'Klein', 'Wolf', 'Schröder', 'Neumann', 'Schwarz', 'Zimmermann', 'Braun', 'Krüger',
      'Hartmann', 'Lange', 'Schmitt', 'Schmitz', 'Krause', 'Meier', 'Lehmann', 'Schulze', 'Maier', 'Köhler', 'König',
      'Walter', 'Mayer', 'Huber', 'Kaiser', 'Fuchs', 'Peters', 'Lang', 'Scholz', 'Möller', 'Weiß', 'Jung', 'Hahn',
      'Schubert', 'Vogel', 'Keller', 'Günther', 'Frank', 'Berger', 'Winkler', 'Roth', 'Beck', 'Lorenz', 'Baumann',
      'Franke', 'Albrecht', 'Simon', 'Ludwig', 'Böhm', 'Winter', 'Kraus', 'Schumacher', 'Krämer', 
      'Stein', 'Jäger', 'Otto', 'Groß', 'Seidel', 'Heinrich', 'Yılmaz', 'Kaya', 'Öztürk', 'Kowalski', 'Nowak'],
  },
  french: {
    first: ['Lucas', 'Hugo', 'Théo', 'Louis', 'Nathan', 'Mathis', 'Enzo', 'Maxime', 'Antoine', 'Thomas', 'Alexandre',
      'Clément', 'Quentin', 'Romain', 'Julien', 'Florian', 'Adrien', 'Valentin', 'Jordan', 'Bastien', 'Yanis', 'Rayan',
      'Mehdi', 'Moussa', 'Mamadou', 'Ousmane', 'Kévin', 'Jérémy', 'Arnaud', 'Damien', 'Rémi', 'Axel',
      'Tom', 'Noah', 'Gabriel', 'Raphaël', 'Malo', 'Sacha', 'Amine', 'Bilal', 'Youssouf', 'Wilfried', 'Désiré'],
    last: ['Martin', 'Bernard', 'Dubois', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon',
      'Laurent', 'Lefebvre', 'Michel', 'Garcia', 'David', 'Bertrand', 'Roux', 'Vincent', 'Fournier', 'Morel', 'Girard',
      'André', 'Mercier', 'Dupont', 'Lambert', 'Bonnet', 'François', 'Legrand', 'Garnier', 'Faure', 'Rousseau', 'Guérin',
      'Roussel', 'Perrin', 'Morin', 'Gauthier', 'Dumont', 'Fontaine', 'Chevalier', 'Masson', 'Boyer', 'Denis',
      'Lemaire', 'Duval', 'Joly', 'Roche', 'Noël', 'Diallo', 'Traoré', 'Koné', 'Camara', 'Diop', 'Ndiaye', 
      'Sylla', 'Baldé', 'Diakité', 'Kanté', 'Bamba', 'Touré', 'Mbemba', 'Benali', 'Haddad', 'Mansour',
      'Belkacem', 'Lacroix', 'Barbier', 'Carpentier', 'Marchand'],
  },
  czech: {
    first: ['Jan', 'Jakub', 'Tomáš', 'Lukáš', 'Martin', 'Ondřej', 'Petr', 'David', 'Matěj', 'Adam', 'Vojtěch', 'Filip',
      'Michal', 'Daniel', 'Pavel', 'Marek', 'Josef', 'Jiří', 'Roman', 'Radek', 'Zdeněk', 'Libor', 'Aleš', 'Vít',
      'Kamil', 'Štěpán', 'Dominik', 'Patrik', 'Šimon', 'Antonín', 'Milan', 'Karel', 'Robin', 'Denis', 'Matyáš',
      'Lubomír', 'Stanislav', 'Jaroslav', 'Miroslav', 'Václav'],
    last: ['Novák', 'Svoboda', 'Novotný', 'Dvořák', 'Procházka', 'Kučera', 'Veselý', 'Horák', 'Němec', 'Pokorný',
      'Marek', 'Pospíšil', 'Hájek', 'Jelínek', 'Král', 'Růžička', 'Beneš', 'Fiala', 'Sedláček', 'Zeman',
      'Kolář', 'Navrátil', 'Čermák', 'Urban', 'Vaněk', 'Blažek', 'Kříž', 'Bartoš', 'Vlček', 'Polák', 'Musil',
      'Kopecký', 'Šimek', 'Konečný', 'Malý', 'Holub', 'Štěpánek', 'Staněk', 'Hruška', 'Bureš', 'Mach', 
      'Říha', 'Tichý', 'Hrubý', 'Matoušek', 'Krejčí', 'Šťastný', 'Vávra', 'Kratochvíl', 'Zelenka', 
      'Hladík', 'Kubíček', 'Mareček', 'Toman', 'Slavík'],
  },
});

// The guest countries of the European competitions (clubs only, no league):
// a few broad styles, each shared by neighbouring countries.
Object.assign(STYLES, {
  portuguese: {
    first: ['João', 'Rui', 'Tiago', 'Diogo', 'Gonçalo', 'Rodrigo', 'Francisco', 'Pedro', 'Miguel', 'André', 'Bruno',
      'Nuno', 'Ricardo', 'Vítor', 'Fábio', 'Hugo', 'Duarte', 'Afonso', 'Martim', 'Rafael', 'Henrique', 'Bernardo',
      'Samuel', 'Gustavo', 'Tomás', 'Leonardo', 'Wellington', 'Matheus', 'Thiago', 'Danilo'],
    last: ['Silva', 'Santos', 'Ferreira', 'Pereira', 'Oliveira', 'Costa', 'Rodrigues', 'Martins', 'Sousa', 'Fernandes',
      'Gonçalves', 'Gomes', 'Lopes', 'Marques', 'Alves', 'Almeida', 'Ribeiro', 'Pinto', 'Carvalho', 'Teixeira',
      'Moreira', 'Correia', 'Mendes', 'Nunes', 'Soares', 'Vieira', 'Monteiro', 'Cardoso', 'Rocha', 'Neves', 'Coelho',
      'Cunha', 'Pires', 'Ramos', 'Reis', 'Simões', 'Antunes', 'Matos', 'Fonseca', 'Machado', 'Araújo', 'Barbosa'],
  },
  dutch: {
    first: ['Daan', 'Sem', 'Lucas', 'Milan', 'Levi', 'Luuk', 'Thijs', 'Jesse', 'Bram', 'Lars', 'Ruben', 'Stijn', 'Tim',
      'Bas', 'Jordy', 'Kevin', 'Wout', 'Jens', 'Sander', 'Niels', 'Joep', 'Siem', 'Arthur', 'Lennert', 'Senne', 'Mats',
      'Jorrit', 'Quinten', 'Brian', 'Noah'],
    last: ['de Jong', 'Jansen', 'de Vries', 'van den Berg', 'van Dijk', 'Bakker', 'Visser', 'Smit', 'Meijer', 'de Boer',
      'Mulder', 'de Groot', 'Bos', 'Vos', 'Peters', 'Hendriks', 'van Leeuwen', 'Dekker', 'Brouwer', 'de Wit', 'Dijkstra',
      'Smits', 'de Graaf', 'van der Meer', 'Kok', 'Jacobs', 'Vermeulen', 'Peeters', 'Maes', 'Claes', 'Willems',
      'Goossens', 'Wouters', 'De Smet', 'Janssens', 'Mertens', 'Verbeke', 'Hoekstra', 'Postma', 'Kuipers'],
  },
  turkish: {
    first: ['Mehmet', 'Mustafa', 'Ahmet', 'Ali', 'Hüseyin', 'Emre', 'Burak', 'Can', 'Kerem', 'Arda', 'Oğuz', 'Barış',
      'Cenk', 'Serdar', 'Hakan', 'Yusuf', 'Enes', 'Furkan', 'Berkay', 'Ozan', 'Orkun', 'Doğan', 'Eren', 'Kaan', 'Umut',
      'Rauf', 'Elvin', 'Tural', 'Murad'],
    last: ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Yıldırım', 'Öztürk', 'Aydın', 'Özdemir', 'Arslan',
      'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Kara', 'Koç', 'Kurt', 'Özkan', 'Şimşek', 'Polat', 'Erdem', 'Güler', 'Aktaş',
      'Bulut', 'Korkmaz', 'Ünal', 'Tekin', 'Karaca', 'Akın', 'Uçar', 'Yavuz', 'Mammadov', 'Aliyev', 'Huseynov'],
  },
  greek: {
    first: ['Giorgos', 'Dimitris', 'Kostas', 'Nikos', 'Giannis', 'Christos', 'Vasilis', 'Thanasis', 'Panagiotis',
      'Michalis', 'Stelios', 'Andreas', 'Petros', 'Sotiris', 'Lefteris', 'Manolis', 'Antonis', 'Pavlos', 'Fotis',
      'Kyriakos', 'Marios', 'Tasos', 'Charalambos', 'Savvas'],
    last: ['Papadopoulos', 'Papadakis', 'Georgiou', 'Nikolaou', 'Ioannou', 'Konstantinou', 'Dimitriou', 'Christodoulou',
      'Vlachos', 'Pappas', 'Antoniou', 'Makris', 'Alexiou', 'Karagiannis', 'Mavros', 'Katsaros', 'Oikonomou',
      'Theodorou', 'Stavrou', 'Petrou', 'Athanasiou', 'Michailidis', 'Kyriakou', 'Laskaris', 'Galanis', 'Siopis',
      'Chatzis', 'Kotsis', 'Tsimikas', 'Bakasetas'],
  },
  scandi: {
    first: ['Oliver', 'William', 'Noah', 'Emil', 'Lucas', 'Magnus', 'Mathias', 'Jonas', 'Kasper', 'Rasmus', 'Mikkel',
      'Anders', 'Fredrik', 'Henrik', 'Sondre', 'Eirik', 'Kristian', 'Sebastian', 'Viktor', 'Gustav', 'Isak', 'Elias',
      'Oskar', 'Joel', 'Ville', 'Aleksi', 'Teemu', 'Jesper', 'Tobias', 'Patrick'],
    last: ['Hansen', 'Johansen', 'Olsen', 'Larsen', 'Andersen', 'Pedersen', 'Nielsen', 'Kristiansen', 'Jensen',
      'Karlsen', 'Berg', 'Haugen', 'Johansson', 'Andersson', 'Karlsson', 'Nilsson', 'Eriksson', 'Larsson', 'Lindberg',
      'Holm', 'Lund', 'Dahl', 'Strand', 'Bakke', 'Moen', 'Solberg', 'Virtanen', 'Korhonen', 'Mäkinen', 'Nieminen',
      'Lehtonen', 'Thomsen', 'Christensen', 'Mortensen', 'Sørensen', 'Rasmussen', 'Poulsen', 'Lindqvist'],
  },
  balkan: {
    first: ['Luka', 'Marko', 'Nikola', 'Stefan', 'Filip', 'Ivan', 'Josip', 'Ante', 'Mario', 'Dario', 'Nemanja', 'Aleksandar',
      'Dušan', 'Milan', 'Petar', 'Mateo', 'Toni', 'Denis', 'Jan', 'Žan', 'Amir', 'Edin', 'Kristijan', 'Bojan', 'Dimitar',
      'Georgi', 'Ivaylo', 'Ardit', 'Klevis', 'Erion'],
    last: ['Horvat', 'Kovačević', 'Babić', 'Marić', 'Jurić', 'Novak', 'Petrović', 'Jovanović', 'Nikolić', 'Marković',
      'Đorđević', 'Stojanović', 'Ilić', 'Pavlović', 'Milošević', 'Popović', 'Kovač', 'Perić', 'Vuković', 'Knežević',
      'Hadžić', 'Begić', 'Krajnc', 'Zupan', 'Mlakar', 'Ivanov', 'Georgiev', 'Dimitrov', 'Petrov', 'Hoxha', 'Krasniqi',
      'Berisha', 'Gashi', 'Šimić', 'Brozović', 'Vlašić'],
  },
  eastern: {
    first: ['Jakub', 'Kacper', 'Szymon', 'Mateusz', 'Bartosz', 'Kamil', 'Michał', 'Oleksandr', 'Andriy', 'Mykola',
      'Dmytro', 'Artem', 'Bohdan', 'Valeriy', 'Dominik', 'Ádám', 'Bence', 'Dániel', 'Andrei', 'Alexandru', 'Ionuț',
      'Gheorghe', 'Kristaps', 'Mantas', 'Lukas', 'Arman', 'Daniyar', 'Giorgi', 'Levan', 'Narek'],
    last: ['Nowak', 'Kowalski', 'Wiśniewski', 'Wójcik', 'Kamiński', 'Lewandowski', 'Zieliński', 'Szymański', 'Dąbrowski',
      'Kozłowski', 'Mazur', 'Krawczyk', 'Shevchenko', 'Bondarenko', 'Kovalenko', 'Tkachenko', 'Kravchenko', 'Melnyk',
      'Nagy', 'Kovács', 'Tóth', 'Szabó', 'Horváth', 'Popescu', 'Ionescu', 'Stan', 'Dumitru', 'Bērziņš', 'Kazlauskas',
      'Petrauskas', 'Abenov', 'Beridze', 'Kapanadze', 'Hovhannisyan', 'Grigoryan', 'Cohen', 'Levi', 'Mizrahi'],
  },
});

const fill =(tpl, map) => tpl.replace(/\{(\w)\}/g, (_, k) => map[k] ?? '');

export function personName(rng, style) {
  const s = STYLES[style];
  return { first: rng.pick(s.first), last: surname(rng, style) };
}

export function surname(rng, style) {
  const s = STYLES[style];
  if (s.last) return rng.pick(s.last);
  return rng.pick(s.lastPre) + rng.pick(s.lastSuf);
}

// `used` collects towns and prefixes; a prefix is only reused once the fresh
// ones run out, so towns in one country don't all look alike.
export function townName(rng, style, used) {
  const s = STYLES[style];
  for (let i = 0; i < 400; i++) {
    const pre = rng.pick(s.townPre);
    const t = pre + rng.pick(s.townSuf);
    if (used.has(t) || (i < 300 && used.has('pre:' + pre))) continue;
    used.add(t);
    used.add('pre:' + pre);
    return t;
  }
  throw new Error('Ran out of town names for ' + style);
}

export function clubName(rng, style, town) {
  return fill(rng.pick(STYLES[style].club), { t: town });
}

export function stadiumName(rng, style, town) {
  return fill(rng.pick(STYLES[style].stadium), { t: town, s: surname(rng, style) });
}

export function initials(name) {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.map((w) => w[0]).join('').slice(0, 3).toUpperCase();
}
