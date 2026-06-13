from hermes_cli.studio.motions import HF_DOP_MOTIONS, HF_DOP_OPTIONS


def test_motion_catalog_has_121_values():
    assert len(HF_DOP_MOTIONS) == 121


def test_motion_catalog_unique():
    assert len(set(HF_DOP_MOTIONS)) == len(HF_DOP_MOTIONS)


def test_motion_catalog_spot_checks():
    # Exact strings from the MUAPI OpenAPI HfDopVideoRequest.motion enum,
    # including the lowercase "up" in "Tilt up".
    for value in ("Bullet Time", "360 Orbit", "Tilt up", "Super 8MM", "YoYo Zoom"):
        assert value in HF_DOP_MOTIONS


def test_options_enum():
    assert HF_DOP_OPTIONS == ("dop-lite", "dop-turbo", "dop-preview")
