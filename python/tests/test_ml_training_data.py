import pathlib
import sys
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from ml.train import split_corpus_sentences  # noqa: E402
from ml.training_data.aac_corpus import get_corpus_stats  # noqa: E402


class MLTrainingDataTests(unittest.TestCase):
    def test_corpus_stats_reflect_generated_expansion(self):
        stats = get_corpus_stats()
        self.assertGreater(stats["unique_sentences"], 900)
        self.assertGreaterEqual(stats["categories"], 14)

    def test_sentence_level_split_prevents_duplicate_overlap(self):
        corpus = [
            "I need water",
            "I need water",
            "I need help",
            "Please come here",
            "Please come here",
            "Good morning",
            "Good night",
        ]

        train_corpus, val_corpus, split_stats = split_corpus_sentences(
            corpus, val_split=0.4, seed=7
        )

        train_unique = {" ".join(s.lower().split()) for s in train_corpus}
        val_unique = {" ".join(s.lower().split()) for s in val_corpus}

        self.assertTrue(train_unique)
        self.assertTrue(val_unique)
        self.assertFalse(train_unique & val_unique)
        self.assertEqual(split_stats["overlap_unique_sentences"], 0)


if __name__ == "__main__":
    unittest.main()
