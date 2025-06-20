import cv2
import sys

def compare(img1_path, img2_path):
    img1 = cv2.imread(img1_path)
    img2 = cv2.imread(img2_path)

    if img1 is None or img2 is None:
        print(0.0)
        return

    img1 = cv2.resize(img1, (300, 300))
    img2 = cv2.resize(img2, (300, 300))

    orb = cv2.ORB_create()
    kp1, des1 = orb.detectAndCompute(img1, None)
    kp2, des2 = orb.detectAndCompute(img2, None)

    if des1 is None or des2 is None:
        print(0.0)
        return

    bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
    matches = bf.match(des1, des2)
    matches = sorted(matches, key=lambda x: x.distance)

    good_matches = [m for m in matches if m.distance < 50]
    score = len(good_matches) / max(len(matches), 1)
    print(score)

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(0.0)
    else:
        compare(sys.argv[1], sys.argv[2])
