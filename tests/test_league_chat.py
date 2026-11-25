import json
from io import BytesIO
from unittest import TestCase
from unittest.mock import patch

from league_chat import chat_response, league_answer


class LeagueChatTests(TestCase):
    def test_historic_title_uses_official_source(self):
        answer = league_answer('Who won the first Premier League season?')
        self.assertIn('Manchester United', answer['answer'])
        self.assertIn('1992/93', answer['answer'])
        self.assertTrue(any(source['url'].startswith('https://www.premierleague.com/') for source in answer['sources']))
        self.assertTrue(any(source['url'] == '/history/1992-93' for source in answer['sources']))

    def test_modelled_results_are_labelled(self):
        answer = league_answer('Modelled Arsenal vs Chelsea in 2024/25')
        self.assertIn('modelled', answer['answer'])
        self.assertIn('generated scores', answer['answer'])

    def test_titles_and_record_questions(self):
        self.assertIn('13', league_answer('Who won the most Premier League titles?')['answer'])
        self.assertIn('7 clubs', league_answer('How many teams have won the Premier League?')['answer'])
        self.assertIn('260', league_answer('Who is the all-time top scorer?')['answer'])
        self.assertIn('Liverpool', league_answer('Who won in 2024/25?')['answer'])

    def test_recorded_scores_and_historic_awards_come_from_the_database(self):
        matches = league_answer('Arsenal vs Chelsea in 2024/25')
        self.assertIn('Chelsea 1–1 Arsenal', matches['answer'])
        self.assertIn('Arsenal 1–0 Chelsea', matches['answer'])
        self.assertTrue(any('openfootball' in source['url'] for source in matches['sources']))
        self.assertIn('Mohamed Salah (29 goals)', league_answer('Who won the Golden Boot in 2024/25?')['answer'])
        self.assertIn('Chelsea', league_answer('Who finished second in 03/04?')['answer'])

    def test_unsupported_input_is_not_sent_without_an_opt_in_key(self):
        with patch.dict('os.environ', {'PL_CHAT_OPENAI_KEY': ''}):
            with patch('league_chat.urlopen') as external:
                status, result = chat_response(json.dumps({'message': 'Name the capital of Japan.'}).encode())
        self.assertEqual(status, 200)
        self.assertIn('don’t have that answer', result['answer'])
        external.assert_not_called()

    def test_opt_in_general_answer_is_labelled(self):
        response = BytesIO(json.dumps({'output': [
            {'type': 'message', 'content': [{'type': 'output_text', 'text': 'Tokyo is the capital of Japan.'}]}
        ]}).encode())
        with patch.dict('os.environ', {'PL_CHAT_OPENAI_KEY': 'test-key'}):
            with patch('league_chat.urlopen', return_value=response) as external:
                status, result = chat_response(json.dumps({'message': 'Name the capital of Japan.'}).encode())
        self.assertEqual(status, 200)
        self.assertEqual(result, {'answer': 'Tokyo is the capital of Japan.', 'sources': [], 'mode': 'general'})
        outbound = json.loads(external.call_args.args[0].data)
        self.assertEqual(outbound['input'], 'Name the capital of Japan.')
        self.assertFalse(outbound['store'])

    def test_rejects_empty_or_overlong_input(self):
        self.assertEqual(chat_response(b'{}')[0], 400)
        self.assertEqual(chat_response(b'not JSON')[0], 400)
        self.assertEqual(chat_response(json.dumps({'message': 'x' * 501}).encode())[0], 400)
