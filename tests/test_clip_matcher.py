import unittest
import subprocess
import os
import sys

# --- Configuration ---
# Test media files are expected to be in a 'test_media' subdirectory of the project root.
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
TEST_MEDIA_DIR = os.path.join(PROJECT_ROOT, "test_media")

# --- IMPORTANT: User needs to place their test files in the 'test_media' directory --- 
# --- and update these filenames if they are different.                          ---
CORRECT_VIDEO_FILENAME = "Aqua Teen Hunger Force (2000) - S01E01 - Rabbot [MAX WEBDL-1080p][EAC3 2.0][x264]-mkv"
CORRECT_STILL_FILENAME = "correct_still.jpeg"
INCORRECT_STILL_FILENAME = "incorrect_still.jpeg"

# Construct full paths relative to project root for checking existence and passing to script
CORRECT_VIDEO_FILE = os.path.join(TEST_MEDIA_DIR, CORRECT_VIDEO_FILENAME)
CORRECT_STILL_FOR_VIDEO = os.path.join(TEST_MEDIA_DIR, CORRECT_STILL_FILENAME)
INCORRECT_STILL_FOR_VIDEO = os.path.join(TEST_MEDIA_DIR, INCORRECT_STILL_FILENAME)

CLIP_MATCHER_SCRIPT_PATH = os.path.join(PROJECT_ROOT, "scripts", "clip-matcher.py")
TEST_THRESHOLD = "0.90"
# --- End Configuration ---

class TestClipMatcher(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        """Check if essential files exist before running tests."""
        print(f"Project root determined as: {PROJECT_ROOT}")
        print(f"Expecting test media in: {TEST_MEDIA_DIR}")
        print(f"Checking for video: {CORRECT_VIDEO_FILE}")
        print(f"Checking for correct still: {CORRECT_STILL_FOR_VIDEO}")
        print(f"Checking for incorrect still: {INCORRECT_STILL_FOR_VIDEO}")
        print(f"Checking for clip matcher script: {CLIP_MATCHER_SCRIPT_PATH}")

        if not os.path.exists(CLIP_MATCHER_SCRIPT_PATH):
            raise FileNotFoundError(f"Clip matcher script not found: {CLIP_MATCHER_SCRIPT_PATH}")
        
        cls.skip_tests = False
        if not os.path.exists(TEST_MEDIA_DIR):
            print(f"WARNING: Test media directory '{TEST_MEDIA_DIR}' does not exist. Please create it. Skipping tests.")
            cls.skip_tests = True
            return
            
        if not os.path.exists(CORRECT_VIDEO_FILE):
            print(f"WARNING: CORRECT_VIDEO_FILE '{CORRECT_VIDEO_FILE}' does not exist in {TEST_MEDIA_DIR}. Skipping tests.")
            cls.skip_tests = True
            return
        if not os.path.exists(CORRECT_STILL_FOR_VIDEO):
            print(f"WARNING: CORRECT_STILL_FOR_VIDEO '{CORRECT_STILL_FOR_VIDEO}' does not exist in {TEST_MEDIA_DIR}. Skipping tests.")
            cls.skip_tests = True
            return
        if not os.path.exists(INCORRECT_STILL_FOR_VIDEO):
            print(f"WARNING: INCORRECT_STILL_FOR_VIDEO '{INCORRECT_STILL_FOR_VIDEO}' does not exist in {TEST_MEDIA_DIR}. Skipping tests.")
            cls.skip_tests = True
            return

    def _run_clip_matcher(self, video_path, force_still_path, threshold):
        """Helper function to run the clip-matcher.py script and return its process result."""
        command = [
            sys.executable, 
            CLIP_MATCHER_SCRIPT_PATH,
            video_path, 
            "--force-still", force_still_path, 
            "--threshold", threshold,
            "--max-stills", "1", 
            "--model-name", "openai/clip-vit-base-patch32",
            "--cpu"
        ]
        print(f"\nRunning command: {' '.join(command)}")
        process = subprocess.run(command, capture_output=True, text=True, cwd=PROJECT_ROOT)
        print("--- STDOUT ---")
        print(process.stdout)
        print("--- STDERR ---")
        print(process.stderr)
        print(f"--- Exit Code: {process.returncode} ---")
        return process

    def test_01_verifies_correct_match(self):
        """Test that the script correctly verifies a known good match."""
        if self.skip_tests: self.skipTest("Test media files not configured or not found.")
        
        print("\nStarting test_01_verifies_correct_match...")
        process_result = self._run_clip_matcher(CORRECT_VIDEO_FILE, CORRECT_STILL_FOR_VIDEO, TEST_THRESHOLD)
        self.assertEqual(process_result.returncode, 0, 
                         f"Script should exit with 0 for a correct match, but got {process_result.returncode}")
        self.assertIn("Match: ✓ VERIFIED", process_result.stdout, 
                      "Stdout should indicate a verified match.")

    def test_02_rejects_incorrect_match(self):
        """Test that the script correctly rejects a known incorrect match."""
        if self.skip_tests: self.skipTest("Test media files not configured or not found.")

        print("\nStarting test_02_rejects_incorrect_match...")
        process_result = self._run_clip_matcher(CORRECT_VIDEO_FILE, INCORRECT_STILL_FOR_VIDEO, TEST_THRESHOLD)
        self.assertEqual(process_result.returncode, 1,
                         f"Script should exit with 1 for an incorrect match, but got {process_result.returncode}")
        self.assertIn("Match: ✗ WRONG EPISODE", process_result.stdout,
                      "Stdout should indicate a non-verified match or wrong episode.")

    # Potential future test: Test without --force-still to check TMDB integration for a known episode
    # def test_03_tmdb_match(self):
    #     if self.skip_tests: self.skipTest("Test media files not configured.")
    #     print("\nStarting test_03_tmdb_match...")
    #     command = [sys.executable, CLIP_MATCHER_SCRIPT_PATH, CORRECT_VIDEO_FILE, "--threshold", TEST_THRESHOLD, "--cpu"]
    #     process = subprocess.run(command, capture_output=True, text=True)
    #     # This assertion depends on TMDB providing good stills and the video matching them
    #     self.assertEqual(process.returncode, 0, "Script should find a match using TMDB.")

if __name__ == "__main__":
    # Ensure temp/verification output directories for clip-matcher.py exist relative to project root
    if not os.path.exists(os.path.join(PROJECT_ROOT, "verification")): 
        os.makedirs(os.path.join(PROJECT_ROOT, "verification"), exist_ok=True)
    if not os.path.exists(os.path.join(PROJECT_ROOT, "temp")): 
        os.makedirs(os.path.join(PROJECT_ROOT, "temp"), exist_ok=True)
    
    suite = unittest.TestSuite()
    suite.addTest(TestClipMatcher('test_01_verifies_correct_match'))
    suite.addTest(TestClipMatcher('test_02_rejects_incorrect_match'))
    # suite.addTest(TestClipMatcher('test_03_tmdb_match'))

    runner = unittest.TextTestRunner(verbosity=2)
    runner.run(suite) 