"""Apply the bounded-output build changes to pinned occt-import-js source."""
from pathlib import Path
import sys

root = Path(sys.argv[1])
cmake = root / "CMakeLists.txt"
s = cmake.read_text()
marker = "\ttarget_link_options (OcctImportJS PUBLIC --bind)"
assert marker in s
s = s.replace(marker, marker + "\n\ttarget_link_options (OcctImportJS PUBLIC -sMAXIMUM_MEMORY=268435456 -sINITIAL_MEMORY=33554432 -sABORTING_MALLOC=0 -sDYNAMIC_EXECUTION=0 -sEXPORT_ES6=1 -sENVIRONMENT=worker)")
cmake.write_text(s)
path = root / "occt-import-js/src/js-interface.cpp"
s = path.read_text().replace("#include <emscripten/bind.h>", "#include <emscripten/bind.h>\n#include <stdexcept>\n#include <new>\n#include <Standard_OutOfMemory.hxx>")
s = s.replace("void WriteNode (const NodePtr& node, emscripten::val& nodeObj)", "void WriteNode (const NodePtr& node, emscripten::val& nodeObj, int depth = 0)")
s = s.replace('        nodeObj.set ("name",', '        if (++mNodeCount > 4096 || depth > 64) throw std::length_error ("resource-limit");\n        nodeObj.set ("name",')
s = s.replace("WriteNode (child, childNodeObj);", "WriteNode (child, childNodeObj, depth + 1);")
s = s.replace("            emscripten::val meshObj", "            if (mMeshCount >= 4096) throw std::length_error (\"resource-limit\");\n            emscripten::val meshObj")
s = s.replace("                int triangleOffset", "                if (++mFaceCount > 100000) throw std::length_error (\"resource-limit\");\n                int triangleOffset")
s = s.replace("                    positionArr.set (vertexCount * 3,", "                    if (++mVertexCount > 1000000) throw std::length_error (\"resource-limit\");\n                    positionArr.set (vertexCount * 3,")
s = s.replace("                    normalArr.set (normalCount * 3,", "                    if (++mNormalCount > 1000000) throw std::length_error (\"resource-limit\");\n                    normalArr.set (normalCount * 3,")
s = s.replace("                    indexArr.set (triangleCount * 3,", "                    if (++mTriangleCount > 500000) throw std::length_error (\"resource-limit\");\n                    indexArr.set (triangleCount * 3,")
s = s.replace("    int mMeshCount;", "    int mMeshCount;\n    int mNodeCount = 0;\n    int mFaceCount = 0;\n    int mVertexCount = 0;\n    int mNormalCount = 0;\n    int mTriangleCount = 0;")
start = s.index("static emscripten::val ImportFile")
end = s.index("static ImportParams GetImportParams", start)
function = s[start:end]
function = function.replace('    const std::vector<uint8_t>& bufferArr', '    try {\n    const std::vector<uint8_t>& bufferArr')
function = function.replace('    return resultObj;\n}\n', '''    return resultObj;
    } catch (const std::length_error&) {
        resultObj.set ("success", false); resultObj.set ("error", "resource-limit");
    } catch (const std::bad_alloc&) {
        resultObj.set ("success", false); resultObj.set ("error", "resource-limit");
    } catch (const Standard_OutOfMemory&) {
        resultObj.set ("success", false); resultObj.set ("error", "resource-limit");
    }
    return resultObj;
}
''')
s = s[:start] + function + s[end:]
path.write_text(s)
