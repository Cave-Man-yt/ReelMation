import { SamplePreset } from '../types';

export const SAMPLE_PRESETS: SamplePreset[] = [
  {
    id: 'explain-photosynthesis',
    title: 'Photosynthesis Explained',
    category: 'Biology',
    iconName: 'Sparkles',
    subject: 'Explain Photosynthesis and how plants convert light into energy',
    knowledge: `Photosynthesis is the process by which green plants and some other organisms use sunlight to synthesize foods from carbon dioxide and water.
Photosynthesis in plants generally involves the green pigment chlorophyll and generates oxygen as a byproduct.
The overall equation is 6CO2 + 6H2O + light energy → C6H12O6 + 6O2.`
  },
  {
    id: 'dna-replication',
    title: 'DNA Replication',
    category: 'Genetics',
    iconName: 'Brain',
    subject: 'How DNA Replicates before cell division',
    knowledge: `DNA replication is the biological process of producing two identical replicas of DNA from one original DNA molecule.
Helicase unwinds the double helix, while DNA polymerase synthesizes the new strands by adding nucleotides.
It is a semiconservative process, meaning each new DNA molecule contains one original strand and one newly synthesized strand.`
  },
  {
    id: 'black-hole',
    title: 'Black Holes',
    category: 'Astrophysics',
    iconName: 'Sparkles',
    subject: 'What is a Black Hole and how does its gravity work',
    knowledge: `A black hole is a region of spacetime where gravity is so strong that nothing—no particles or even electromagnetic radiation such as light—can escape from it.
The boundary of the region from which no escape is possible is called the event horizon.
They are formed when massive stars collapse at the end of their life cycle.`
  },
  {
    id: 'neural-networks',
    title: 'Neural Networks',
    category: 'Computer Science',
    iconName: 'Network',
    subject: 'How Neural Networks Learn using gradient descent',
    knowledge: `Neural networks adjust their internal weights based on the error of their predictions.
Backpropagation is used to calculate the gradient of the loss function with respect to the weights.
Gradient descent uses these gradients to update the weights in the direction that minimizes the error.`
  }
];
