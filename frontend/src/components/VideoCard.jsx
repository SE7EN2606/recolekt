export default function VideoCard({ data, onClick }) {
  return (
    <div
      className="bg-gray-800 rounded-lg overflow-hidden shadow-lg cursor-pointer hover:shadow-xl transition"
      onClick={onClick}
    >
      {data.thumbnail && (
        <img
          src={data.thumbnail}
          alt={data.title}
          className="w-full h-48 object-cover"
        />
      )}
      <div className="p-2">
        <h3 className="text-white font-semibold text-sm">{data.title}</h3>
      </div>
    </div>
  );
}