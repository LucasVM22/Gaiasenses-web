import { useCallback } from "react";
import CompositionsInfo from "@/components/compositions/compositions-info";

// 1. CONFIG (dados de satélite passados pelo servidor)
export type ClimaData = {
  windSpeed: number;
  humidity: number;
  clouds: number;
  temperature: number;
  lightnings: number;
  fireSpots: number;
};

export function useCompositionQueue(clima: ClimaData) {
  const getNextComposition = useCallback((): [string, any] => {
    // 2. SCORES BASE
    const scores = {
      void: 25,
      aeolus: 0,
      spark: 0,
      flow: 0,
      ethereal: 0,
      infernus: 0,
      thermal: 0,
    };

    // 3. REGRAS
    const regras = {
      spark: () => {
        if (clima.lightnings > 0) {
          scores.spark += 85;
          scores.void = 0;
        }
      },

      aeolus: () => {
        scores.aeolus += clima.windSpeed * 2.5;
        if (clima.windSpeed > 8) scores.void = 0;
      },

      flow: () => {
        scores.flow += clima.humidity * 0.5;
        if (clima.humidity > 80) scores.void = 0;
      },

      ethereal: () => {
        if (clima.clouds > 70) {
          scores.ethereal += 45;
        }
      },

      temperatura: () => {
        if (clima.fireSpots > 0) {
          scores.infernus += 100;
          scores.void = 0;
          return;
        }

        if (clima.temperature > 32) {
          scores.infernus += 30;
          scores.thermal += clima.temperature * 0.5;
        } else {
          scores.thermal += clima.temperature * 0.8;
        }
      },
    };

    // Executa todas as regras
    Object.values(regras).forEach((fn) => fn());

    // 4. COMPOSIÇÕES (adjusted to match enabled compositions)
    const composicoes: Record<string, string[]> = {
      void: ["zigzag", "attractor"],
      aeolus: ["windLines", "stormEye", "riverLines"],
      spark: ["lightnigBolts", "attractor", "zigzag", "stormEye"],
      flow: ["lluvia", "digitalOrganism", "riverLines", "zigzag", "curves"],
      ethereal: ["cloudBubble"],
      infernus: ["burningTrees", "bonfire"],
      thermal: [
        "colorFlower",
        "generativeStrings",
        "curves",
        "riverLines",
        "mudflatScatter",
      ],
    };

    // 5. DECISÃO
    const categoria = (Object.keys(scores) as (keyof typeof scores)[]).reduce(
      (a, b) => (scores[a] > scores[b] ? a : b),
    );

    const escolha =
      composicoes[categoria][
        Math.floor(Math.random() * composicoes[categoria].length)
      ];

    //checar no terminal:
    // console.log("————————————————————————————————————————————————————")
    // console.log("Scores:", scores);
    // console.log("Categoria escolhida:", categoria);
    // console.log("Composição escolhida:", escolha);
    // console.log("————————————————————————————————————————————————————")

    // Find the composition info
    const compositionInfo =
      CompositionsInfo[escolha as keyof typeof CompositionsInfo];
    if (!compositionInfo) {
      // Fallback to default
      const defaultComp = "attractor";
      return [defaultComp, CompositionsInfo[defaultComp]];
    }
    return [escolha, compositionInfo];
  }, [clima]);

  return { getNextComposition };
}

/* Old implementation of getNextComposition for preservation:

import { useCallback, useState } from "react";
import { comps, shuffle } from "./map-constants";

export function useCompositionQueue() {
  const [shuffled, setShuffled] = useState<Generator<any>>(() =>
    shuffle([...comps]),
  );

  const getNextComposition = useCallback((): [string, any] => {
    let next = shuffled.next().value;
    if (next === undefined) {
      const newShuffle = shuffle([...comps]);
      next = newShuffle.next().value;
      setShuffled(newShuffle);
    }
    return next;
  }, [shuffled]);

  return { getNextComposition };
}

*/
